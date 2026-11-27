// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import React from 'react';
import { safeIconNode } from './assets.ts';

/** アイコン（Issue #98）。決まったタグと属性だけで組み立て、innerHTML を使わない。色は文字色（currentColor） */
export function IconSvg({ node, size = 24, strokeWidth = 2, label }: { node: unknown; size?: number; strokeWidth?: number; label?: string }) {
  const shapes = safeIconNode(node);
  if (!shapes) return null;
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className="rm-icon"
    role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'} focusable="false">
    {shapes.map(([tag, attributes], index) => React.createElement(tag, { key: index, ...attributes }))}
  </svg>;
}
