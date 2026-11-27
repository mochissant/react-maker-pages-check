// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * スプリング（硬さ・減衰・質量）を、CSS の linear() イージングにする（Issue #103）。
 * 減衰振動の式を時間で刻み、行き過ぎ（1 を超える値）を含めた点の並びにする。
 * 考え方は linear-easing-generator（Jake Archibald）や Motion の spring と同じ。
 * Web Animations API にそのまま渡せるので、プレビューと書き出したサイトで同じ動きになる（実行時の追加の依存なし）
 */
import type { SpringSettings } from './model-types.ts';

export const defaultSpring: SpringSettings = { stiffness: 300, damping: 18, mass: 1 };

/** 時刻 t（秒）の位置（0 → 1） */
function position({ stiffness, damping, mass }: SpringSettings, t: number) {
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * t) * (Math.cos(omegaD * t) + (zeta * omega / omegaD) * Math.sin(omegaD * t));
  }
  if (zeta === 1) return 1 - Math.exp(-omega * t) * (1 + omega * t);
  const r1 = -omega * (zeta - Math.sqrt(zeta * zeta - 1));
  const r2 = -omega * (zeta + Math.sqrt(zeta * zeta - 1));
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

function valid(spring: Partial<SpringSettings> | null | undefined): spring is SpringSettings {
  return [spring?.stiffness, spring?.damping, spring?.mass].every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
}

/** 落ち着くまでの時間（ms）。最大 3 秒 */
export function springDuration(spring: Partial<SpringSettings> | null | undefined) {
  if (!valid(spring)) return 0;
  const step = 1 / 120;
  let settled = 0;
  for (let t = 0; t < 3; t += step) {
    if (Math.abs(1 - position(spring, t)) > 0.002) settled = t + step;
  }
  return Math.max(16, Math.round(settled * 1000));
}

/** linear() の文字列と、その時間（ms） */
export function springEasing(spring: Partial<SpringSettings> | null | undefined, points = 48) {
  if (!valid(spring)) return null;
  const duration = springDuration(spring);
  const values = Array.from({ length: points + 1 }, (_, index) => {
    const value = index === points ? 1 : position(spring, (duration / 1000) * (index / points));
    return Math.round(value * 10000) / 10000;
  });
  return { easing: `linear(${values.join(', ')})`, duration };
}

/** 曲線の見本（SVG の点の並び。幅 width・高さ height、行き過ぎも見えるよう上下に余白） */
export function springCurve(spring: Partial<SpringSettings> | null | undefined, width = 160, height = 80) {
  const result = springEasing(spring, 60);
  if (!result) return '';
  const values = result.easing.slice(7, -1).split(', ').map(Number);
  const top = Math.max(1.2, ...values);
  const bottom = Math.min(0, ...values);
  return values.map((value, index) => `${Math.round((index / (values.length - 1)) * width)},${Math.round(height - ((value - bottom) / (top - bottom)) * height)}`).join(' ');
}
