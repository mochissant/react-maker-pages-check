// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * GUIで付けた名前を、ソースコードでの名前に変換する規則（Issue #127）。
 *
 * - 意味が必要なもの（画面・共通部品・データ・データ項目・デザイントークン）は「コード名」を持つ。
 *   利用者が付けたコード名（item.codeName）が正しく重複しなければ使い、なければ名前から自動で作る
 * - 英数字だけの名前はそのまま変換し、日本語を含む名前は種類と連番にする（日本語は表示用の文字列とコメントに残す）
 * - 意味が不要なもの（個々の要素のID・スタイルのクラス名）は、体系的な自動名（rm-element-12 など）のまま
 */

import type { ProjectData } from './model-types.ts';

type NameStyle = 'kebab' | 'pascal' | 'camel';
export type CodeNameKind = 'screen' | 'component' | 'dataset' | 'field' | 'token';
type Named = { id: string; name?: string; codeName?: string };

export const codeNameKinds: Record<CodeNameKind, { label: string; style: NameStyle; prefix: string; example: string }> = {
  screen: { label: 'URLのパス', style: 'kebab', prefix: 'page', example: 'event-list' },
  component: { label: 'コンポーネント名', style: 'pascal', prefix: 'Component', example: 'PrimaryButton' },
  dataset: { label: '型名', style: 'pascal', prefix: 'Data', example: 'Event' },
  field: { label: 'プロパティ名', style: 'camel', prefix: 'field', example: 'startsAt' },
  token: { label: 'CSS変数名', style: 'kebab', prefix: 'token', example: 'brand' },
};

const patterns: Record<NameStyle, RegExp> = {
  kebab: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  pascal: /^[A-Z][A-Za-z0-9]*$/,
  camel: /^[a-z][A-Za-z0-9]*$/,
};

const styleRules: Record<NameStyle, string> = {
  kebab: '英小文字で始まり、英小文字・数字・ハイフン区切り',
  pascal: '英大文字で始まる英数字',
  camel: '英小文字で始まる英数字',
};

/** JavaScript・TypeScript の予約語と、書き出しのコードが使う名前 */
const reserved = new Set(`
break case catch class const continue debugger default delete do else enum export extends false finally for function if
import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements
interface package private protected public await any boolean number string symbol object undefined never unknown type
React Fragment Site App ScreenView`.trim().split(/\s+/));

/** 英数字の語に分ける。日本語などを含む名前は null（自動の連番にする） */
function words(name: unknown) {
  if (typeof name !== 'string') return null;
  const text = name.normalize('NFKC').trim();
  if (!text || /[^\x20-\x7e]/.test(text)) return null;
  const parts = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts.length && /^[A-Za-z]/.test(parts[0]) ? parts.map((part) => part.toLowerCase()) : null;
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function formatCodeName(parts: string[], style: NameStyle) {
  if (style === 'kebab') return parts.join('-');
  if (style === 'pascal') return parts.map(capitalize).join('');
  return parts[0] + parts.slice(1).map(capitalize).join('');
}

/** コード名として正しいか。誤りなら理由の文、正しければ null */
export function codeNameError(value: string, kind: CodeNameKind) {
  const { style } = codeNameKinds[kind];
  if (!patterns[style].test(value)) return `${styleRules[style]}で入力してください（例：${codeNameKinds[kind].example}）。`;
  if (reserved.has(value)) return `「${value}」はコードで予約されている名前です。`;
  return null;
}

/**
 * 項目の並びにコード名を割り当てる。返り値は id → コード名。
 * 利用者のコード名を優先し、自動の名前は重複しないよう連番を付ける
 */
export function assignCodeNames<Item extends Named>(items: readonly Item[], kind: CodeNameKind, nameOf: (item: Item) => unknown = (item) => item.name) {
  const { style, prefix } = codeNameKinds[kind];
  const result = new Map<string, string>();
  const used = new Set<string>();
  for (const item of items) {
    if (typeof item.codeName === 'string' && !codeNameError(item.codeName, kind) && !used.has(item.codeName)) {
      result.set(item.id, item.codeName);
      used.add(item.codeName);
    }
  }
  let sequence = 0;
  for (const item of items) {
    if (result.has(item.id)) continue;
    const parts = words(nameOf(item));
    let base: string | null = parts ? formatCodeName(parts, style) : null;
    if (base && codeNameError(base, kind)) base = null;
    let candidate = base;
    for (let suffix = 2; parts && candidate && used.has(candidate); suffix += 1) candidate = formatCodeName([...parts, String(suffix)], style);
    while (!candidate || used.has(candidate)) {
      sequence += 1;
      candidate = formatCodeName([...(words(prefix) ?? []), String(sequence)], style);
    }
    result.set(item.id, candidate);
    used.add(candidate);
  }
  return result;
}

/** トークンの CSS 変数の名前空間（--color-*・--text-* など）。名前空間が違えば、同じコード名でもぶつからない */
export const tokenNamespaces: Record<string, string> = {
  color: 'color', fontSize: 'text', textStyle: 'text', spacing: 'spacing', shadow: 'shadow', radius: 'radius', borderWidth: 'border-width',
  fontWeight: 'font-weight', lineHeight: 'leading', letterSpacing: 'tracking', fontFamily: 'font', duration: 'duration', easing: 'ease',
  opacity: 'opacity', zIndex: 'z',
};

/** トークンのコード名：名前空間ごとに重ならないように決める（Issue #124） */
export function assignTokenCodeNames<Token extends Named & { kind: string }>(tokens: readonly Token[]) {
  const result = new Map<string, string>();
  const namespaceOf = ({ kind }: Token) => tokenNamespaces[kind] ?? `?${kind}`;
  for (const namespace of new Set(tokens.map(namespaceOf))) {
    const group = tokens.filter((token) => namespaceOf(token) === namespace);
    for (const [id, name] of assignCodeNames(group, 'token')) result.set(id, name);
  }
  return result;
}

/** プロジェクト全体のコード名 */
export function projectCodeNames(project: Pick<ProjectData, 'screens' | 'datasets' | 'designSystem'>) {
  const screens = assignCodeNames(project.screens, 'screen');
  const datasets = assignCodeNames(project.datasets ?? [], 'dataset');
  return {
    screens,
    pages: new Map([...screens].map(([id, slug]) => [id, `${formatCodeName(slug.split('-'), 'pascal')}Page`])),
    components: assignCodeNames(project.designSystem?.components ?? [], 'component'),
    tokens: assignTokenCodeNames(project.designSystem?.tokens ?? []),
    datasets,
    fields: new Map((project.datasets ?? []).map((dataset) => [dataset.id, assignCodeNames(dataset.fields, 'field', (field) => field.label)])),
  };
}

/** 入力欄の検査：書式と、同じ種類の中での重複 */
export function codeNameProblem(value: string, kind: CodeNameKind, others: string[]) {
  if (!value) return null;
  return codeNameError(value, kind) ?? (others.includes(value) ? 'ほかの項目と重複しています。' : null);
}
