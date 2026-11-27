// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * ホバー・押下・フォーカス・無効の状態ごとのスタイル（Issue #97）。
 * element.states = { hover: { style }, active: { style }, focus: { style }, disabled: { style } }。通常の値への上書き。
 * - 書き出し：hover: active: focus-visible: disabled: のクラス（export-styles.js）
 * - プレビューと、クラスにできなかった要素：<style> の規則（stateRules）。インラインのスタイルに勝つよう !important を付ける
 */
import { cssProperty, declarations } from './css-declarations.ts';
import { elementStyle, responsiveValues } from './responsive.ts';
import type { Breakpoint, ElementData } from './model-types.ts';

export const elementStates = [
  { id: 'hover', label: 'ホバー', variant: 'hover', pseudo: ':hover' },
  { id: 'active', label: '押下', variant: 'active', pseudo: ':active' },
  { id: 'focus', label: 'フォーカス', variant: 'focus-visible', pseudo: ':focus-visible' },
  { id: 'disabled', label: '無効', variant: 'disabled', pseudo: ':disabled' },
  { id: 'checked', label: '選択中', variant: 'checked', pseudo: ':checked' },
  // 現在の画面（下部タブバー。#230）と、目次・セクションのドットの今見ている位置（#238。aria-current="location"）
  { id: 'current', label: '現在の画面・位置', variant: '[&:is([aria-current=page],[aria-current=location])]', pseudo: ':is([aria-current="page"], [aria-current="location"])' },
];

/** 変化の時間と曲線の候補（モーションのトークン #105 ができたら置き換える） */
export const stateDurations = [['', '既定（150ms）'], ['0', 'なし'], ['100', '速い（100ms）'], ['200', '標準（200ms）'], ['320', 'ゆっくり（320ms）']];
export const stateEasings = [['', '既定（ease-out）'], ['ease', 'ease'], ['ease-in-out', 'ease-in-out'], ['linear', 'linear'],
  ['cubic-bezier(0.2, 0, 0, 1)', '強調（cubic-bezier(0.2, 0, 0, 1)）']];

export function hasStates(element: Pick<ElementData, 'states'>) {
  return elementStates.some(({ id }) => Object.keys(element.states?.[id]?.style ?? {}).length > 0 || Object.keys(element.states?.[id]?.tokenRefs ?? {}).length > 0);
}

/** 状態の上書きを、CSSに書けるスタイル（ぼかし・変形などの変換を済ませたもの）にする */
export function stateStyle(element: Pick<ElementData, 'style' | 'states' | 'responsive' | 'css'>, state: string, parent?: ElementData, breakpoints?: readonly Breakpoint[], width = 0) {
  const style = element.states?.[state]?.style;
  if (!style || !Object.keys(style).length) return null;
  const effective = { ...element.style, ...responsiveValues(element.responsive, breakpoints, width).values };
  const base = elementStyle({ style: effective, css: element.css }, breakpoints, width, parent);
  const next = elementStyle({ style: { ...effective, ...style }, css: element.css }, breakpoints, width, parent);
  const before = base as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((property) => before[property] !== after[property]).map((property) => [property, after[property] ?? 'initial']));
}

const escapeId = (id: string) => String(id).replace(/["\\]/g, '\\$&');

/**
 * プレビュー用の規則。edit（編集モード）では本物のホバーなどを使わず、forced（{ id, state }）の要素だけ固定して見せる
 */
type StateRuleOptions = { editing?: boolean; forced?: { id: string; state: string } | null; skip?: (id: string) => boolean; breakpoints?: readonly Breakpoint[]; width?: number };

export function stateRules(elements: ElementData[], { editing = false, forced, skip = () => false, breakpoints, width = 0 }: StateRuleOptions = {}) {
  const rules: string[] = [];
  (function visit(nodes: ElementData[], parent?: ElementData) {
    for (const element of nodes) {
      for (const { id: state, pseudo } of elementStates) {
        if (skip(element.id)) break;
        const style = stateStyle(element, state, parent, breakpoints, width);
        const body = style && declarations(style as Record<string, unknown>);
        if (!body?.size) continue;
        const target = `[data-element-id="${escapeId(element.id)}"]`;
        const selectors = [];
        if (!editing) selectors.push(`${target}${pseudo}`);
        if (forced?.id === element.id && forced.state === state) selectors.push(`${target}[data-force-state]`);
        if (!selectors.length) continue;
        rules.push(`${selectors.join(', ')} { ${[...body].map(([property, value]) => `${property}: ${value} !important;`).join(' ')} }`);
      }
      if (element.children) visit(element.children, element);
    }
  })(elements);
  return rules.join('\n');
}

export { cssProperty };
