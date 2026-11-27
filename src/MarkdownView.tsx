// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * ダミーデータの「リッチテキスト」（Markdown）を描く（Issue #164）。書き出す共有ランタイム。
 * 読む記法は rich-text.ts の markdownBlocks（CommonMark の一部）。HTML の直接の記述は描かず、文字は React がエスケープする。
 * 見出しは h3〜h5（一覧・詳細の中の見出しより下の段。# ## は大、### は中、#### 以下は小）、太字は strong、斜体は em、取り消し線は s、リンクは a
 */
import React from 'react';
import type { ReactNode } from 'react';
import type { RichSpan } from './model-types.ts';
import { markdownBlocks, safeUrl } from './rich-text.ts';

function inline(spans: RichSpan[], newTab: boolean) {
  return spans.map((span, index) => {
    let node: ReactNode = span.text.split('\n').map((part, line) => <React.Fragment key={line}>{line ? <br /> : null}{part}</React.Fragment>);
    if (span.code) node = <code>{node}</code>;
    if (span.strike) node = <s>{node}</s>;
    if (span.italic) node = <em>{node}</em>;
    if (span.bold) node = <strong>{node}</strong>;
    const url = span.link ? safeUrl(span.link.url) : null;
    if (url) {
      // サイトの外へのリンクだけ、新しいタブで開く（設定したとき）
      const external = /^https?:\/\//i.test(url);
      node = <a href={url} target={external && newTab ? '_blank' : undefined} rel={external && newTab ? 'noopener noreferrer' : undefined}>{node}</a>;
    }
    return <React.Fragment key={index}>{node}</React.Fragment>;
  });
}

/** 本文の見出しの段：# と ## は大、### は中、#### 以下は小（本文の外の見出しより下の段に描く） */
const headings = { h1: 'h3', h2: 'h3', h3: 'h4', h4: 'h5' } as const;
const proseLevels = { h1: 'h2', h2: 'h2', h3: 'h3', h4: 'h4' } as const;

export function MarkdownView({ source, newTab = false, className = 'rm-markdown' }: { source: unknown; newTab?: boolean; className?: string }) {
  const { blocks } = markdownBlocks(source);
  return <div className={className}>{blocks.map((block, index) => {
    if (block.type === 'ul' || block.type === 'ol') {
      const List = block.type;
      return <List key={index}>{block.items.map((spans, item) => <li key={item}>{inline(spans, newTab)}</li>)}</List>;
    }
    if (block.type === 'blockquote') return <blockquote key={index}>{inline(block.items[0] ?? [], newTab)}</blockquote>;
    if (block.type === 'hr') return <hr key={index} />;
    if (block.type === 'p') return <p key={index}>{inline(block.items[0] ?? [], newTab)}</p>;
    // 見出しの段（本文のスタイルの見出し大・中・小。Issue #177）
    const Tag = headings[block.type];
    return <Tag key={index} data-prose={proseLevels[block.type]}>{inline(block.items[0] ?? [], newTab)}</Tag>;
  })}</div>;
}
