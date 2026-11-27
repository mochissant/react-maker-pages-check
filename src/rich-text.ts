// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 文章の一部の装飾と、段落・箇条書き（Issue #150）。書き出す共有ランタイム。
 * - element.richText は段落（ブロック）の並び。ブロックは装飾つきの文字のかたまり（span）の並び
 * - element.text は、いつも装飾を除いた全文（段落の区切りは空行）。検索・ラベル・データの代わりに使う
 * - 装飾は意味のある要素にする：太字 <strong>、斜体 <em>、取り消し線 <s>、リンク <a>。下線と色は <span> のスタイル
 * - 段落は <p>、箇条書きは <ul>・<ol> と <li>。文字の要素の見た目（スタイル）は、要素の外側に付く
 * - データに結び付けた文字は、要素全体の装飾だけを使う（一部の装飾は、ダミーデータの md 形式の文字列で。#164）
 */
import type { ElementData, RichBlock, RichSpan } from './model-types.ts';

export type { RichBlock, RichSpan };

const colorPattern = /^#[0-9a-f]{3,8}$/i;
/** リンク先として書いてよいURL（http・https・mailto・tel と、サイトの中のパス） */
export function safeUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const value = url.trim();
  if (/^(https?:\/\/|mailto:|tel:)[^\s"<>]+$/i.test(value) || /^\/(?!\/)[^\s"<>]*$/.test(value) || /^#[\w-]+$/.test(value)) return value;
  return null;
}

function cleanSpan(input: unknown): RichSpan | null {
  if (!input || typeof input !== 'object') return null;
  const span = input as Record<string, unknown>;
  if (typeof span.text !== 'string' || !span.text) return null;
  const result: RichSpan = { text: span.text };
  if (span.bold === true) result.bold = true;
  if (span.italic === true) result.italic = true;
  if (span.underline === true) result.underline = true;
  if (span.strike === true) result.strike = true;
  if (span.code === true) result.code = true;
  if (typeof span.color === 'string' && colorPattern.test(span.color)) result.color = span.color;
  const link = span.link as Record<string, unknown> | undefined;
  if (link && typeof link === 'object') {
    const next: NonNullable<RichSpan['link']> = {};
    if (typeof link.screenId === 'string' && link.screenId) next.screenId = link.screenId;
    else if (typeof link.url === 'string') next.url = link.url;
    if (link.newTab === true) next.newTab = true;
    result.link = next;
  }
  return result;
}

/** 同じ装飾が続く span をまとめる */
function mergeSpans(spans: RichSpan[]) {
  const result: RichSpan[] = [];
  for (const span of spans) {
    const last = result.at(-1);
    const { text: _lastText, ...lastMarks } = last ?? { text: '' };
    const { text, ...marks } = span;
    if (last && JSON.stringify(lastMarks) === JSON.stringify(marks)) last.text += text;
    else result.push({ ...span });
  }
  return result;
}

/** 正しい形のブロックだけを残す（壊れたデータでも描ける） */
export function cleanBlocks(input: unknown): RichBlock[] {
  if (!Array.isArray(input)) return [];
  return input.map((block) => {
    const spans = Array.isArray((block as RichBlock | null)?.spans) ? (block as RichBlock).spans : [];
    return { spans: mergeSpans(spans.map(cleanSpan).filter((span): span is RichSpan => span !== null)) };
  });
}

export const blockText = (block: RichBlock) => block.spans.map(({ text }) => text).join('');
/** 装飾を除いた全文。段落は空行で区切る */
export const plainText = (blocks: readonly RichBlock[]) => blocks.map(blockText).join('\n\n');
export const hasMarks = (blocks: readonly RichBlock[]) => blocks.some(({ spans }) => spans.some(({ text: _text, ...marks }) => Object.keys(marks).length > 0));

/** 箇条書きか：style.listStyle（記号つき disc・番号つき decimal）。文章（text）だけ */
export function listKind(element: Pick<ElementData, 'type' | 'style'>): 'ul' | 'ol' | null {
  if (element.type !== 'text') return null;
  return element.style?.listStyle === 'disc' ? 'ul' : element.style?.listStyle === 'decimal' ? 'ol' : null;
}

/**
 * 要素の段落。装飾つきの文章（richText）がいまの文言と合えばそれを、合わなければ文言から作る。
 * 文言の空行は段落の区切り（箇条書きでは、1行が1項目）。見出し・ボタンは段落に分けない
 */
export function elementBlocks(element: Pick<ElementData, 'type' | 'text' | 'richText' | 'style'>): RichBlock[] {
  const text = typeof element.text === 'string' ? element.text : '';
  const rich = cleanBlocks(element.richText);
  if (rich.length && plainText(rich) === text) return element.type === 'text' ? rich : [{ spans: rich.flatMap((block, index) => index ? [{ text: '\n\n' }, ...block.spans] : block.spans) }];
  if (element.type !== 'text') return [{ spans: text ? [{ text }] : [] }];
  const parts = listKind(element) ? text.split(/\n+/) : text.split(/\n{2,}/);
  return parts.filter((part, index) => part || index === 0).map((part) => ({ spans: part ? [{ text: part }] : [] }));
}

/** 段落・箇条書き・装飾のどれかがあり、文字を1つの文字列で描けない */
export function isStructured(element: Pick<ElementData, 'type' | 'text' | 'richText' | 'style'>) {
  const blocks = elementBlocks(element);
  return blocks.length > 1 || Boolean(listKind(element)) || hasMarks(blocks);
}

/** 装飾を付ける・外す（キャンバスの編集で使う）。範囲は全文の文字の位置 */
export type MarkName = 'bold' | 'italic' | 'underline' | 'strike';

/** 文字の要素のタグ。文章：段落が複数なら div、箇条書きなら ul・ol、それ以外は p。見出しは h1〜h6 */
export function textTag(element: Pick<ElementData, 'type' | 'text' | 'richText' | 'style' | 'level'>) {
  if (element.type === 'heading') return `h${[1, 2, 3, 4, 5, 6].includes(element.level ?? 2) ? element.level ?? 2 : 2}`;
  const list = listKind(element);
  if (list) return list;
  return elementBlocks(element).length > 1 ? 'div' : 'p';
}

/** 内側のタグ：段落は p、箇条書きは li。1段落の p・見出しは null（そのまま中身） */
export function blockTag(element: Pick<ElementData, 'type' | 'text' | 'richText' | 'style' | 'level'>) {
  const outer = textTag(element);
  return outer === 'ul' || outer === 'ol' ? 'li' : outer === 'div' ? 'p' : null;
}

const escapeJsx = (value: string) => `{${JSON.stringify(value)}}`;
const attribute = (value: string) => JSON.stringify(value);

/**
 * 書き出す TSX の中身（screen-files.js）。装飾を意味のある要素にする。
 * 画面へのリンクは、サイトの遷移（ScreenView）に任せるため、ここでは扱わない（呼び出し側で element(…) にする）
 */
export function blocksJsx(element: Pick<ElementData, 'type' | 'text' | 'richText' | 'style' | 'level'>, pad: string) {
  const inner = blockTag(element);
  const spansJsx = (spans: RichSpan[]) => spans.map((span) => {
    const parts = span.text.split('\n');
    let node = parts.map((part, index) => `${index ? '<br />' : ''}${part ? escapeJsx(part) : ''}`).join('');
    const style = [span.underline ? 'textDecorationLine: "underline"' : '', span.color ? `color: ${attribute(span.color)}` : ''].filter(Boolean);
    if (style.length) node = `<span style={{ ${style.join(', ')} }}>${node}</span>`;
    if (span.strike) node = `<s>${node}</s>`;
    if (span.italic) node = `<em>${node}</em>`;
    if (span.bold) node = `<strong>${node}</strong>`;
    const url = span.link && !span.link.screenId ? safeUrl(span.link.url) : null;
    if (url) node = `<a href=${attribute(url)}${span.link?.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''}>${node}</a>`;
    return node;
  }).join('');
  const blocks = elementBlocks(element);
  if (!inner) return spansJsx(blocks[0]?.spans ?? []);
  return `\n${blocks.map((block) => `${pad}  <${inner}>${spansJsx(block.spans)}</${inner}>`).join('\n')}\n${pad}`;
}

/** 画面へのリンクを含むか（書き出しでは共通の描画に任せる） */
export const linksToScreens = (element: Pick<ElementData, 'type' | 'text' | 'richText' | 'style'>) =>
  elementBlocks(element).some(({ spans }) => spans.some(({ link }) => Boolean(link?.screenId)));

/**
 * Markdown（Issue #164）：ダミーデータの「リッチテキスト」の中身。CommonMark の次の範囲だけを読む。
 * 見出し（# ## ###）・段落（空行で区切る）・改行・箇条書き（- * +）・番号つき（1.）・引用（>）・太字（** __）・斜体（* _）・取り消し線（~~）・リンク [文字](URL)
 * HTML の直接の記述は描かない（文字のまま出し、problems で知らせる）。描画は React が文字をエスケープする
 */
export type MarkdownBlock = { type: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'ul' | 'ol' | 'blockquote' | 'hr'; items: RichSpan[][] };

/** 1行の中の装飾を span にする */
export function markdownInline(source: string): RichSpan[] {
  const spans: RichSpan[] = [];
  const pattern = /`([^`\n]+)`|(\*\*|__)(.+?)\2|~~(.+?)~~|(\*|_)(?!\s)(.+?)(?<!\s)\5|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > last) spans.push({ text: source.slice(last, match.index) });
    if (match[1] !== undefined) spans.push({ text: match[1], code: true });
    else if (match[3] !== undefined) spans.push(...markdownInline(match[3]).map((span) => ({ ...span, bold: true })));
    else if (match[4] !== undefined) spans.push(...markdownInline(match[4]).map((span) => ({ ...span, strike: true })));
    else if (match[6] !== undefined) spans.push(...markdownInline(match[6]).map((span) => ({ ...span, italic: true })));
    else if (match[7] !== undefined) spans.push(...markdownInline(match[7]).map((span) => ({ ...span, link: { url: match[8] } })));
    last = match.index + match[0].length;
  }
  if (last < source.length) spans.push({ text: source.slice(last) });
  return spans.filter(({ text }) => text);
}

export function markdownBlocks(source: unknown): { blocks: MarkdownBlock[]; problems: string[] } {
  const text = typeof source === 'string' ? source.replace(/\r\n?/g, '\n') : '';
  const problems: string[] = [];
  if (/<\/?[a-z][^>]*>/i.test(text)) problems.push('HTMLの直接の記述は使えません。文字のまま表示します。');
  for (const [, , url] of text.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)) {
    if (!safeUrl(url)) problems.push(`リンク先「${url}」は使えません（https:// や / で始まるURL、mailto:、tel:）。`);
  }
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', items: [paragraph.flatMap((line, index) => [...(index ? [{ text: '\n' }] : []), ...markdownInline(line)])] });
    paragraph = [];
  };
  for (const line of text.split('\n')) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s{0,3}[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/.exec(line);
    const quote = /^\s{0,3}>\s?(.*)$/.exec(line);
    const previous = blocks.at(-1);
    if (!line.trim()) { flush(); continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push({ type: 'hr', items: [] }); continue; }
    if (heading) { flush(); blocks.push({ type: (['h1', 'h2', 'h3', 'h4'][Math.min(heading[1].length, 4) - 1] as 'h1' | 'h2' | 'h3' | 'h4'), items: [markdownInline(heading[2].replace(/\s+#+\s*$/, ''))] }); continue; }
    if (bullet || numbered) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const item = markdownInline((bullet ?? numbered)?.[1] ?? '');
      if (previous?.type === type && !paragraph.length) previous.items.push(item); else blocks.push({ type, items: [item] });
      continue;
    }
    if (quote) {
      flush();
      if (previous?.type === 'blockquote') previous.items[0].push({ text: '\n' }, ...markdownInline(quote[1])); else blocks.push({ type: 'blockquote', items: [markdownInline(quote[1])] });
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return { blocks, problems };
}

/** Markdown から装飾を除いた文字（読み上げの代わり・長さの確認に使う） */
export const markdownText = (source: unknown) => markdownBlocks(source).blocks.map(({ items }) => items.map((spans) => spans.map(({ text }) => text).join('')).join('\n')).join('\n\n');

/** 本文のスタイル（Issue #177）のクラス名。CSS は prose-styles.js が作る */
export const proseClass = (id: unknown) => `rm-prose-${String(id).replace(/[^a-z0-9-]/gi, '')}`;
