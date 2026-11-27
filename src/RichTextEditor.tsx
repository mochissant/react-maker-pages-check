// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * キャンバスで、文章の一部に装飾を付ける（Issue #150）。文言の直接編集（#82）の、文章・見出し用。
 * - 範囲を選んで、太字・斜体・下線・取り消し線・色・リンクを付ける。⌘/Ctrl+B・I・U・K と、上に出る道具の列で
 * - 文章は Enter で段落を分け、Shift+Enter で改行する。見出しは Enter で確定、Shift+Enter で改行
 * - 確定したら、編集した中身（DOM）を段落と装飾（rich-text.ts の RichBlock）に読み戻す
 * リンク先（画面・URL）は、右の設定パネルの「文中のリンク」で選ぶ（⌘K で付けたリンクは、リンク先が空のまま）
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import type { RichBlock, RichSpan } from './model-types.ts';
import { cleanBlocks, plainText } from './rich-text.ts';

/** ⌘K で付けた、リンク先がまだ無いリンク */
export const pendingLink = '#rm-link';

const hex = (value: string) => {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (match) return `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value.toLowerCase() : undefined;
};

type Marks = Omit<RichSpan, 'text'>;

/** 編集した中身（DOM）を段落と装飾にする。blocks は段落（p・div・li）。見出しでは1段落 */
export function readEditable(root: HTMLElement, multiline: boolean): RichBlock[] {
  const blocks: RichBlock[] = [];
  let current: RichSpan[] = [];
  const push = (text: string, marks: Marks) => { if (text) current.push({ text, ...marks }); };
  const close = () => { blocks.push({ spans: current }); current = []; };
  function walk(node: Node, marks: Marks) {
    if (node.nodeType === Node.TEXT_NODE) { push((node.textContent ?? '').replace(/ /g, ' '), marks); return; }
    // プレビューの iframe の要素は、別の window のもの（instanceof HTMLElement では判定できない）
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName;
    if (tag === 'BR') {
      // 段落の最後の <br>（空の段落を保つためにブラウザが入れる）は、改行にしない
      if (element.nextSibling) push('\n', marks);
      return;
    }
    const next: Marks = { ...marks };
    if (tag === 'B' || tag === 'STRONG') next.bold = true;
    if (tag === 'I' || tag === 'EM') next.italic = true;
    if (tag === 'U') next.underline = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.strike = true;
    if (tag === 'FONT' && element.getAttribute('color')) next.color = hex(element.getAttribute('color') ?? '');
    if (tag === 'A') {
      const screenId = element.dataset.screenId;
      const href = element.getAttribute('href') ?? '';
      next.link = screenId ? { screenId } : { url: href === pendingLink ? '' : href };
      if (element.getAttribute('target') === '_blank') next.link.newTab = true;
    }
    const { fontWeight, fontStyle, textDecorationLine, color } = element.style;
    if (fontWeight === 'bold' || Number(fontWeight) >= 600) next.bold = true;
    if (fontStyle === 'italic') next.italic = true;
    if (textDecorationLine.includes('underline')) next.underline = true;
    if (textDecorationLine.includes('line-through')) next.strike = true;
    if (color) next.color = hex(color);
    if (next.color === undefined) delete next.color;
    const block = multiline && /^(P|DIV|LI)$/.test(tag) && element !== root;
    if (block && current.length) close();
    for (const child of element.childNodes) walk(child, next);
    if (block) close();
  }
  for (const child of root.childNodes) walk(child, {});
  if (current.length || !blocks.length) close();
  // 前後の空の段落は除く（中の空の段落は、段落の区切りとして意味を持たないので除く）
  return cleanBlocks(blocks.filter((block) => block.spans.some(({ text }) => text.trim())));
}

type Props = {
  as: string;
  props: HTMLAttributes<HTMLElement>;
  /** 編集を始めるときの中身（装飾つき） */
  children: ReactNode;
  multiline: boolean;
  onCommit: (text: string, blocks: RichBlock[]) => void;
};

const tools: Array<[string, string, string]> = [['bold', '太字', 'B'], ['italic', '斜体', 'I'], ['underline', '下線', 'U'], ['strikeThrough', '取り消し線', 'S']];

export function RichTextEditor({ as: Tag, props, children, multiline, onCommit }: Props) {
  const node = useRef<HTMLElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const finished = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const target = node.current;
    if (!target) return;
    const document = target.ownerDocument;
    target.focus();
    // 段落の区切りを <p> にする（Enter で段落を分ける）
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* 使えない環境では <div> になる（どちらも段落として読む） */ }
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const rect = target.getBoundingClientRect();
    setPosition({ left: Math.max(4, rect.left), top: Math.max(4, rect.top - 40) });
    const remember = () => {
      const current = document.getSelection();
      if (current?.rangeCount && target.contains(current.anchorNode)) saved.current = current.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', remember);
    return () => document.removeEventListener('selectionchange', remember);
  }, []);
  function finish() {
    if (finished.current || !node.current) return;
    finished.current = true;
    const blocks = readEditable(node.current, multiline);
    onCommit(plainText(blocks), blocks);
  }
  /** 選んだ範囲に装飾を付ける（ブラウザの編集コマンド。付いていれば外す） */
  function apply(command: string, value?: string) {
    const target = node.current;
    if (!target) return;
    const document = target.ownerDocument;
    // いまの選択が文章の中にあれば、それを使う。selectionchange は遅れて届くので、覚えた範囲（saved）が古いことがある（Issue #220）。
    // 覚えた範囲は、道具の列を押して選択が文章の外へ出たときだけ戻す
    const live = document.getSelection();
    const current = live?.rangeCount && target.contains(live.anchorNode) && target.contains(live.focusNode) ? live.getRangeAt(0).cloneRange() : null;
    target.focus();
    const range = current ?? saved.current;
    if (range) { const selection = document.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, value);
  }
  const { onClick: _onClick, onPointerDown: _onPointerDown, ...rest } = props;
  const Element = Tag as unknown as ComponentType<HTMLAttributes<HTMLElement> & { ref: typeof node }>;
  return <>
    <Element {...rest} ref={node} contentEditable suppressContentEditableWarning role="textbox"
      aria-multiline={multiline} aria-label="文言を編集" data-text-editing="" data-rich-editing=""
      onClick={(event) => { event.stopPropagation(); if ((event.target as Element).closest('a')) event.preventDefault(); }}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={(event) => { if (!toolbar.current?.contains(event.relatedTarget as Node | null)) finish(); }}
      onPaste={(event) => {
        // 貼り付けは文字だけ（よそのページの書式を持ち込まない）
        event.preventDefault();
        event.currentTarget.ownerDocument.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        const mod = event.metaKey || event.ctrlKey;
        if (mod && ['b', 'i', 'u', 'k'].includes(event.key.toLowerCase())) {
          event.preventDefault(); event.stopPropagation();
          const key = event.key.toLowerCase();
          if (key === 'k') apply('createLink', pendingLink);
          else apply(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
          return;
        }
        if (event.key === 'Enter' && event.shiftKey && !mod) { event.preventDefault(); event.currentTarget.ownerDocument.execCommand('insertLineBreak'); return; }
        if (event.key === 'Escape' || (event.key === 'Enter' && (!multiline || mod))) {
          event.preventDefault(); event.stopPropagation();
          finish();
        }
      }}>{children}</Element>
    {position && <div ref={toolbar} className="rm-text-toolbar" role="toolbar" aria-label="文字の装飾" style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => { if (!(event.target as Element).closest('input')) event.preventDefault(); event.stopPropagation(); }}
      onClick={(event) => event.stopPropagation()}>
      {tools.map(([command, label, mark]) => <button key={command} type="button" aria-label={label} title={label} data-mark={command} onClick={() => apply(command)}>{mark}</button>)}
      <label className="rm-text-toolbar-color" title="文字色">
        <span className="visually-hidden">文字色</span>
        <input type="color" aria-label="選んだ範囲の文字色" defaultValue="#d93025" onChange={(event) => apply('foreColor', event.target.value)} />
      </label>
      <button type="button" aria-label="リンク" title="リンク（⌘K）" onClick={() => apply('createLink', pendingLink)}>🔗</button>
      <button type="button" aria-label="装飾を外す" title="装飾を外す" onClick={() => { apply('removeFormat'); apply('unlink'); }}>×</button>
    </div>}
  </>;
}
