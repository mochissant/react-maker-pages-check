#!/usr/bin/env node
// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * react-maker の MCP サーバー（Issue #178）。AI ツール（Claude・Cursor など）から、この案件のトークン・部品・画面・動きのプリセット・
 * デザインチェックの結果を引く。書き出したリポジトリで `npm run mcp` で起動する（stdio。依存パッケージなし）。
 * - 読むもの：src/generated/project.json（値）と src/generated/mcp-index.json（書き出したときの名前・編集GUIを開くリンク）
 * - 名前で引く道具（get_*）と、意味で引く道具（search）を分ける。どの結果にも、編集GUIでその場所を開くリンク（link）を付ける
 * - 読み取り専用。書き込みの道具は次の段階（検証コマンド npm run check:project を必ず通す形にする）
 * 仕様：Model Context Protocol（JSON-RPC 2.0。stdio は1行に1メッセージ）https://modelcontextprotocol.io/specification
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { lintProject } from './project-lint.js';

const protocolVersions = ['2025-06-18', '2025-03-26', '2024-11-05'];
const serverInfo = { name: 'react-maker', title: 'react-maker の案件', version: '1.0.0' };

/** ひらがなにそろえ、「と」「っ」「ー」などの揺れを外す（motion-presets.js と同じ） */
export function normalizeOnomatopoeia(text) {
  return String(text).normalize('NFKC').trim()
    .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .replace(/と$/, '').replace(/[っッーｰ〜~!！]/g, '').replace(/(.+?)\1+$/, '$1');
}

/** 意味で探すための、文字の2文字ずつの組（日本語は単語の区切りが無いので、2文字の重なりで近さを測る） */
const bigrams = (text) => {
  const plain = normalizeOnomatopoeia(String(text).toLowerCase()).replace(/\s+/g, '');
  const list = new Set();
  for (let index = 0; index < plain.length - 1; index += 1) list.add(plain.slice(index, index + 2));
  if (plain.length === 1) list.add(plain);
  return list;
};
/** よく使う言い方 → 探す手がかり（種類・きっかけ・擬態語） */
const synonyms = [
  [/押(す|した|したとき)|タップ|クリック/, '押したとき press ぷに'], [/弾|跳ね|バウンド/, 'ぷに ぽよん ばね spring'], [/出る|現れ|登場|表示され/, 'appear 現れる ふわ ぽよん'],
  [/スクロール/, 'inView scroll スクロールで見えたとき'], [/揺|エラー|間違/, 'ぶる エラー error'], [/消え|閉じ|削除/, 'exit しゅわ 削除 閉じる'],
  [/色|カラー/, 'color 色'], [/余白|間隔|すき間/, 'spacing 余白'], [/角丸|丸み/, 'radius 角丸'], [/影/, 'shadow 影'], [/文字の大きさ|フォントサイズ/, 'fontSize 文字'],
  [/ブランド|メイン|主/, 'brand メイン primary'], [/開閉|アコーディオン|折りたた/, 'accordion 開閉 開いている'], [/タブ|切り替/, 'tabs タブ 切り替え'],
];
const expand = (query) => [query, ...synonyms.filter(([pattern]) => pattern.test(query)).map(([, words]) => words)].join(' ');

function score(query, text) {
  const wanted = bigrams(query);
  if (!wanted.size) return 0;
  const have = bigrams(text);
  let hits = 0;
  for (const pair of wanted) if (have.has(pair)) hits += 1;
  return hits / wanted.size;
}

const includes = (value, query) => !query || String(value ?? '').normalize('NFKC').toLowerCase().includes(String(query).normalize('NFKC').toLowerCase().trim());

export async function loadProject(root) {
  const read = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
  const project = await read('src/generated/project.json');
  let index = null;
  try { index = await read('src/generated/mcp-index.json'); } catch { /* 古い書き出し：名前とリンクなし */ }
  return { project, index };
}

/** トークンの値を、参照（ref）をたどって決める */
function tokenValue(tokens, token, seen = new Set()) {
  if (!token || seen.has(token.id)) return undefined;
  seen.add(token.id);
  if (token.ref) return tokenValue(tokens, tokens.find(({ id }) => id === token.ref), seen);
  return token.value;
}

export function createTools({ project, index }) {
  const tokens = project.designSystem?.tokens ?? [];
  const components = project.designSystem?.components ?? [];
  const tokenIndex = new Map((index?.tokens ?? []).map((item) => [item.id, item]));
  const screenIndex = new Map((index?.screens ?? []).map((item) => [item.id, item]));
  const componentIndex = new Map((index?.components ?? []).map((item) => [item.id, item]));
  const docs = new Map((index?.componentDocs?.components ?? []).map((item) => [item.id, item]));
  const modes = new Map((project.designSystem?.modes ?? []).map(({ id, name }) => [id, name]));
  const screenName = (id) => project.screens.find((screen) => screen.id === id)?.name ?? id;
  const datasetName = (id) => (project.datasets ?? []).find((dataset) => dataset.id === id)?.name ?? id;

  const token = (item) => {
    const extra = tokenIndex.get(item.id);
    const chain = [];
    for (let current = item, seen = new Set(); current?.ref && !seen.has(current.id); current = tokens.find(({ id }) => id === current.ref)) {
      seen.add(current.id);
      const next = tokens.find(({ id }) => id === current.ref);
      if (next) chain.push(next.name);
    }
    return { kind: 'token', id: item.id, name: item.name, tokenKind: item.kind, value: tokenValue(tokens, item), ...(chain.length ? { references: chain } : {}),
      ...(item.modes ? { modes: Object.fromEntries(Object.entries(item.modes).map(([modeId, slot]) => [modes.get(modeId) ?? modeId, slot?.ref ? `→ ${tokens.find(({ id }) => id === slot.ref)?.name}` : slot?.value])) } : {}),
      ...(item.description ? { description: item.description } : {}),
      cssVar: extra?.cssVar ?? null, classes: extra?.classes ?? [], link: extra?.link ?? null };
  };
  const component = (item) => {
    const doc = docs.get(item.id);
    const extra = componentIndex.get(item.id);
    return { kind: 'component', id: item.id, name: item.name, description: item.description ?? '', codeName: extra?.codeName ?? item.codeName ?? null,
      variants: doc?.variants.map(({ name, label }) => ({ name, label })) ?? [{ name: 'base', label: '基本' }, ...(item.variants ?? []).map(({ name }) => ({ name, label: name }))],
      axes: item.axes ?? [], states: (item.variables ?? []).map(({ name, type, initial, options }) => ({ name, type, initial, ...(options ? { options } : {}) })),
      properties: doc?.properties ?? [], usedIn: doc?.usages ?? [], tokens: doc?.tokens.map(({ name }) => name) ?? [], example: doc?.example ?? null,
      file: extra?.file ?? null, docsPage: extra?.docs ?? null, link: extra?.link ?? null };
  };
  const screen = (item) => {
    const extra = screenIndex.get(item.id);
    let count = 0;
    const interactions = [];
    (function walk(elements) {
      for (const element of elements ?? []) {
        count += 1;
        for (const interaction of element.interactions ?? []) interactions.push(`${element.name || element.text || element.type}：${interaction.trigger} → ${interaction.actions.map((action) => action.type).join('・')}`);
        walk(element.children);
      }
    })(item.elements);
    return { kind: 'screen', id: item.id, name: item.name, description: item.description ?? '', status: item.status ?? 'published', path: extra?.path ?? null, codeName: extra?.codeName ?? null,
      elements: count, datasets: (extra?.datasets ?? []).map(datasetName), goesTo: (extra?.targets ?? []).map(screenName), interactions: interactions.slice(0, 30),
      states: (item.variables ?? []).map(({ name, type, initial }) => ({ name, type, initial })), link: extra?.link ?? null };
  };
  const motion = (item) => ({ kind: 'motion', id: item.id, words: item.names, use: item.use, trigger: item.motion?.trigger, reducedMotion: item.reduced === 'none' ? '動かさない' : '不透明度だけ',
    motion: item.motion, howToSet: `要素の animations[] に {...motion, "preset": "${item.id}", "id": "<一意の id>"} を足す。編集GUIでは、要素の設定の「動き」で「${item.names[0]}」を選ぶ` });
  const motions = index?.motions ?? [];

  const findMotions = (word) => {
    const text = normalizeOnomatopoeia(word ?? '');
    if (!text) return motions;
    return motions.filter(({ names, use }) => names.some((name) => { const normalized = normalizeOnomatopoeia(name); return normalized.startsWith(text) || text.startsWith(normalized); }) || includes(use, word));
  };

  const linkOfPath = (pointer) => {
    const match = /^\/screens\/(\d+)(?:.*\/children\/(\d+))?/.exec(pointer ?? '');
    const target = match ? project.screens[Number(match[1])] : undefined;
    return target ? screenIndex.get(target.id)?.link ?? null : null;
  };

  const tools = {
    get_tokens: {
      title: 'トークンを名前・種類で引く',
      description: 'この案件のデザイントークン（色・余白・角丸・影・文字の大きさなど）を、名前（部分一致）か種類で引く。値（参照をたどった最終の値）、参照の道筋、モードごとの値、書き出したときの CSS 変数と Tailwind のクラス、編集GUIを開くリンクを返す。「ブランド色は？」「余白のトークンを全部」のように、名前や種類が分かっているときに使う。意味で探すときは search を使う。',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'トークンの名前（部分一致）。例：メイン' }, kind: { type: 'string', description: '種類：color・spacing・radius・shadow・fontSize・fontWeight・lineHeight・letterSpacing・fontFamily・duration・easing・opacity・zIndex・textStyle・borderWidth' } } },
      run: ({ name, kind }) => tokens.filter((item) => includes(item.name, name) && (!kind || item.kind === kind)).map(token),
    },
    get_components: {
      title: '共通部品を名前で引く',
      description: 'この案件の共通部品を、名前かコンポーネント名（部分一致）で引く。説明、バリアント（と軸）、状態（開閉など）、プロパティ（名前・型・既定値）、使っている画面とトークン、コードの例、書き出したファイル、ドキュメントのページ、編集GUIを開くリンクを返す。名前を省くと全部品の一覧。',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: '部品の名前かコンポーネント名（部分一致）。例：ボタン' } } },
      run: ({ name }) => components.filter((item) => includes(item.name, name) || includes(componentIndex.get(item.id)?.codeName, name)).map(component),
    },
    get_screens: {
      title: '画面を名前で引く',
      description: 'この案件の画面を、名前（部分一致）で引く。URL のパス、下書きかどうか、使っているデータ一覧、遷移先の画面、操作（きっかけと動作）、画面の状態、編集GUIを開くリンクを返す。名前を省くと全画面の一覧。',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: '画面の名前（部分一致）。例：料金' } } },
      run: ({ name }) => project.screens.filter((item) => includes(item.name, name)).map(screen),
    },
    get_motion_presets: {
      title: '動きのプリセットを擬態語・用途で引く',
      description: '擬態語の辞書から、動きのプリセットを引く。「ぷにっと」「ドーン」のような言い方の揺れ（カタカナ・「と」・「っ」・伸ばし棒）は吸収する。用途（「ボタン」「モーダル」）でも引ける。数値（スプリング・時間・曲線）、きっかけの既定、動きを減らす設定での扱い、設定の仕方を返す。「このボタンをぷにっとさせたい」と聞かれたら、これを使う。',
      inputSchema: { type: 'object', properties: { word: { type: 'string', description: '擬態語か用途。例：ぷにっと、ボタン。省くと全プリセット' } } },
      run: ({ word }) => findMotions(word).map(motion),
    },
    search: {
      title: '意味で探す（トークン・部品・画面・動き）',
      description: 'トークン・部品・画面・動きのプリセットを、言葉の意味の近さで横断して探す。名前が分からないとき（「押したときに弾む動き」「注意を促す色」「料金を比べる画面」）に使う。近い順に、種類（kind）と一致度（score）と、編集GUIを開くリンクを返す。名前が分かっているなら get_* の方が正確。',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: '探したいこと（自然な文でよい）' }, limit: { type: 'number', description: '最大件数（既定 8）' } }, required: ['query'] },
      run: ({ query, limit = 8 }) => {
        const wanted = expand(String(query ?? ''));
        const candidates = [
          ...tokens.map((item) => [token(item), `${item.name} ${item.kind} ${item.description ?? ''} ${item.group ?? ''}`]),
          ...components.map((item) => [component(item), `${item.name} ${item.description ?? ''} ${(item.variables ?? []).map(({ name }) => name).join(' ')} ${item.templateId ?? ''}`]),
          ...project.screens.map((item) => [screen(item), `${item.name} ${item.description ?? ''}`]),
          ...motions.map((item) => [motion(item), `${item.names.join(' ')} ${item.use} ${item.motion?.trigger ?? ''} ${item.id}`]),
        ];
        return candidates.map(([result, text]) => ({ ...result, score: Math.round(score(wanted, text) * 100) / 100 }))
          .filter(({ score: value }) => value > 0).sort((a, b) => b.score - a.score).slice(0, Math.min(Math.max(Number(limit) || 8, 1), 30));
      },
    },
    design_check: {
      title: 'デザインチェックの結果',
      description: 'npm run check:project と同じ検査を、いまの src/generated/project.json にかける。要修正（errors）と要確認（warnings。トークンと同じ値の生の値など）を、JSON Pointer の場所と、編集GUIでその画面を開くリンク付きで返す。UI をレビューするときは、最初にこれを使う。',
      inputSchema: { type: 'object', properties: {} },
      run: () => {
        const result = lintProject(project);
        const withLink = (item) => ({ ...item, link: linkOfPath(item.path) });
        return { ok: result.ok, errors: result.errors.map(withLink), warnings: result.warnings.map(withLink) };
      },
    },
  };
  return tools;
}

export const reviewPromptName = 'review-ui';

/** JSON-RPC のメッセージ1つに答える。通知（id なし）には null */
export function createServer({ root, reviewGuide = '', load, extraTools, instructions }) {
  let cache = null;
  // 読む先：手元のフォルダ（root）か、渡された load（URL でつなぐ MCP。Issue #247）
  const state = async () => {
    // 毎回読み直す（エージェントや編集GUIが project.json を書き換えても、最新を返す）
    cache = load ? await load() : await loadProject(root);
    return cache;
  };
  /** 読む道具と、URL でつなぐ MCP の書く道具（readOnly: false） */
  const allTools = (loaded) => ({ ...createTools(loaded), ...(extraTools ? extraTools(loaded) : {}) });
  return async function handle(message) {
    const { id, method, params } = message ?? {};
    const reply = (result) => (id === undefined ? null : { jsonrpc: '2.0', id, result });
    const fail = (code, text) => (id === undefined ? null : { jsonrpc: '2.0', id, error: { code, message: text } });
    if (message?.jsonrpc !== '2.0' || typeof method !== 'string') return fail(-32600, 'Invalid Request');
    if (method === 'initialize') {
      const asked = params?.protocolVersion;
      return reply({ protocolVersion: protocolVersions.includes(asked) ? asked : protocolVersions[0], serverInfo,
        capabilities: { tools: {}, prompts: {} },
        instructions: instructions ?? 'この案件（react-maker で作るサイト）のトークン・共通部品・画面・動きのプリセット・デザインチェックを引けます。値を推測せず、まずこのサーバーで確かめてください。名前が分かれば get_*、分からなければ search。結果の link は編集GUIでその場所を開くURLです。答えるときは、根拠としてトークン名・部品名とリンクを示してください。' });
    }
    if (method.startsWith('notifications/')) return null;
    if (method === 'ping') return reply({});
    if (method === 'tools/list') {
      const tools = allTools(await state());
      return reply({ tools: Object.entries(tools).map(([name, { title, description, inputSchema, readOnly = true }]) => ({ name, title, description, inputSchema,
        annotations: { readOnlyHint: readOnly, ...(readOnly ? {} : { destructiveHint: false, idempotentHint: false }), openWorldHint: false } })) });
    }
    if (method === 'tools/call') {
      let tools;
      try { tools = allTools(await state()); } catch (problem) {
        return reply({ isError: true, content: [{ type: 'text', text: `src/generated/project.json を読めません：${problem.message}` }] });
      }
      const tool = tools[params?.name];
      if (!tool) return fail(-32602, `道具「${params?.name}」はありません`);
      try {
        const result = await tool.run(params.arguments ?? {});
        const empty = Array.isArray(result) && !result.length;
        return reply({ content: [{ type: 'text', text: empty ? '該当するものがありません。search で意味から探すか、名前を短くしてください。' : JSON.stringify(result, null, 2) }],
          structuredContent: { result } });
      } catch (problem) {
        return reply({ isError: true, content: [{ type: 'text', text: problem.message }] });
      }
    }
    if (method === 'prompts/list') {
      return reply({ prompts: [{ name: reviewPromptName, title: 'この案件のUIをレビューする', description: '案件のトークン・部品・デザインチェックに沿ってUIをレビューし、根拠と、コーディング用のAIへの依頼文を出す',
        arguments: [{ name: 'target', description: 'レビューする画面の名前（省くと全画面）', required: false }] }] });
    }
    if (method === 'prompts/get') {
      if (params?.name !== reviewPromptName) return fail(-32602, `プロンプト「${params?.name}」はありません`);
      const target = String(params.arguments?.target ?? '').trim();
      return reply({ description: 'この案件のUIをレビューする', messages: [{ role: 'user', content: { type: 'text', text: `${reviewGuide}\n\nレビューする対象：${target || 'すべての画面'}` } }] });
    }
    return fail(-32601, `Method not found: ${method}`);
  };
}

/** stdio で動かす：1行に1つの JSON-RPC。ログは stderr へ（stdout はメッセージだけ） */
async function main() {
  const root = process.cwd();
  let reviewGuide = '';
  try { reviewGuide = await readFile(path.join(root, 'react-maker/agents/ui-review.md'), 'utf8'); } catch { /* 無ければ空 */ }
  const handle = createServer({ root, reviewGuide });
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      continue;
    }
    const answer = await handle(message);
    if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((problem) => { console.error(problem); process.exit(1); });
}
