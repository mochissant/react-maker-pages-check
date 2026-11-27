// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 要素のスタイルの署名（Issue #116）。書き出し時にクラスを作った元のスタイルを短い文字列で残し、
 * project.json を直接書き換えた要素（署名が合わない要素）は、古いクラスではなく描画時のスタイルで表示する。
 * FNV-1a（32bit）。暗号用ではない
 */
import type { Breakpoint, ScreenData } from './model-types.ts';

type Signed = { style?: unknown; tokenRefs?: unknown; responsive?: unknown; states?: unknown; css?: unknown; stateTransition?: unknown };

export function styleSignature(element: Signed, parent?: Signed) {
  const values = [element.style, element.tokenRefs, element.responsive, element.states, element.css, element.stateTransition];
  // Fill のクラスは親の並びにも依存する。親だけを編集した場合も古いクラスを使わない。
  if (parent) values.push(parent.style, parent.tokenRefs, parent.responsive, parent.css);
  const text = JSON.stringify(values);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** 画面の内容の署名（Issue #106）。画面の要素と幅の区切りが同じなら同じ値 */
export function screenSignature(screen: Pick<ScreenData, 'elements'>, breakpoints?: Breakpoint[]) {
  return styleSignature({ style: screen.elements, tokenRefs: breakpoints ?? [] });
}
