// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 動きのタイムライン（Issue #208）。画面を開いたときの動き（trigger: appear）を、順番と重なりで並べる。
 * - 動きの after（{ id, gap, from }）は、前の動きへの参照：from 'end' は前の動きが終わってから gap ms あと、'start' は前の動きの始まりから gap ms あと（同時なら 0）
 * - 参照で持つので、前の動きの時間や遅延を変えると、あとの動きも連動してずれる。実際の開始時刻は、ここで参照をたどって計算する
 * - 消えた動き・ほかのきっかけの動き・循環した参照は、無いものとして扱う（自分の遅延で始まる）
 */
import type { ElementAnimation, ElementData } from './model-types.ts';

export type TimelineEntry = { elementId: string; elementName: string; animation: ElementAnimation; start: number; duration: number; end: number };

const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** 動き1つの長さ（ms）。速さ（%）と、ずっと繰り返す動きは1回分 */
export function motionLength(animation: ElementAnimation, durationOf?: (animation: ElementAnimation) => number | undefined) {
  const base = durationOf?.(animation) ?? finite(animation.duration, 300) * 100 / (finite(animation.speed, 100) || 100);
  const iterations = animation.iterations === 'infinite' ? 1 : Math.max(1, Math.round(finite(animation.iterations, 1)));
  return Math.max(0, base * iterations);
}

/** 画面の「開いたとき」の動きを並べ、開始・終了の時刻を決める */
export function timelineSchedule(elements: ElementData[], durationOf?: (animation: ElementAnimation) => number | undefined): TimelineEntry[] {
  const entries: Array<{ element: ElementData; animation: ElementAnimation }> = [];
  (function visit(list: ElementData[]) {
    for (const element of list) {
      for (const animation of element.animations ?? []) if (animation.trigger === 'appear' && animation.id) entries.push({ element, animation });
      if (element.children) visit(element.children);
    }
  })(elements);
  const byId = new Map(entries.map((entry) => [entry.animation.id!, entry]));
  const starts = new Map<string, number>();
  const resolving = new Set<string>();
  const startOf = (id: string): number => {
    const known = starts.get(id);
    if (known !== undefined) return known;
    const { animation } = byId.get(id)!;
    const own = finite(animation.delay, 0);
    const reference = animation.after?.id ? byId.get(animation.after.id) : undefined;
    let start = own;
    if (reference && !resolving.has(id)) {
      resolving.add(id);
      const base = startOf(reference.animation.id!);
      if (!resolving.has(reference.animation.id!) || base !== undefined) {
        start = Math.max(0, base + (animation.after?.from === 'start' ? 0 : motionLength(reference.animation, durationOf)) + finite(animation.after?.gap, 0));
      }
      resolving.delete(id);
    }
    starts.set(id, start);
    return start;
  };
  return entries.map(({ element, animation }) => {
    const start = startOf(animation.id!);
    const duration = motionLength(animation, durationOf);
    return { elementId: element.id, elementName: element.name || element.text || element.type, animation, start, duration, end: start + duration };
  });
}

/** 参照をたどると自分に戻るか（タイムラインで、前の動きとして選べないものを外す） */
export function createsTimelineCycle(entries: TimelineEntry[], id: string, referenceId: string) {
  const byId = new Map(entries.map((entry) => [entry.animation.id, entry]));
  let current: string | undefined = referenceId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === id) return true;
    seen.add(current);
    current = byId.get(current)?.animation.after?.id;
  }
  return false;
}
