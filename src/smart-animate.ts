// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 切り替えの自動の動き（Issue #176。Figma のスマートアニメート相当）。共通部品の状態・バリアントを切り替えると、
 * 変わった項目（色・角丸・影・不透明度・位置・大きさ）を CSS の transition で、出る・消える要素を @starting-style と
 * transition-behavior: allow-discrete で動かす。ライブラリを使わず、効かない環境では即座に切り替わるだけ。
 * - 共通部品ごとに component.smartAnimate（既定は「すっ」）。'none' で動かさない
 * - 動きを減らす設定では動かさない（preview.css）
 */
import type { CSSProperties } from 'react';
import type { DesignComponent, SmartAnimate } from './model-types.ts';
import { springEasing } from './spring.ts';

export const smartPresets: Record<SmartAnimate['preset'], { label: string; duration: number; easing: string }> = {
  none: { label: 'なし（即座に切り替える）', duration: 0, easing: 'linear' },
  su: { label: 'すっ（なめらかに）', duration: 240, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  puni: { label: 'ぷにっ（少し弾む）', duration: 0, easing: '' },
  poyon: { label: 'ぽよん（大きく弾む）', duration: 0, easing: '' },
};
const springs: Partial<Record<SmartAnimate['preset'], { stiffness: number; damping: number; mass: number }>> = {
  puni: { stiffness: 420, damping: 18, mass: 1 },
  poyon: { stiffness: 260, damping: 12, mass: 1 },
};

export const isSmartPreset = (value: unknown): value is SmartAnimate['preset'] => typeof value === 'string' && Object.hasOwn(smartPresets, value);

/** 部品の切り替えの動き：{ preset, duration（ms）, easing }。'none' なら null */
export function smartMotion(component: Pick<DesignComponent, 'smartAnimate'> | undefined) {
  const preset = isSmartPreset(component?.smartAnimate?.preset) ? component.smartAnimate.preset : 'su';
  if (preset === 'none') return null;
  const spring = springs[preset];
  const curve = spring ? springEasing(spring) : null;
  const base = smartPresets[preset];
  const duration = Number.isFinite(component?.smartAnimate?.duration) && (component?.smartAnimate?.duration ?? 0) > 0 ? Math.min(component!.smartAnimate!.duration!, 3000) : curve?.duration ?? base.duration;
  const easing = typeof component?.smartAnimate?.easing === 'string' && /^(ease|ease-in|ease-out|ease-in-out|linear|cubic-bezier\([\d.,\s-]+\))$/.test(component.smartAnimate.easing)
    ? component.smartAnimate.easing : curve?.easing ?? base.easing;
  return { preset, duration, easing };
}

/** 配置の根に付けるスタイル（CSS 変数）。preview.css の [data-rm-smart] が読む */
export function smartStyle(motion: ReturnType<typeof smartMotion>): CSSProperties | undefined {
  if (!motion) return undefined;
  return { '--rm-smart-duration': `${motion.duration}ms`, '--rm-smart-easing': motion.easing } as CSSProperties;
}

/** 画面の間でつなげる名前（view-transition-name）。CSS の名前に使える文字だけにする */
export function connectName(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const ascii = [...value.trim()].map((character) => /[A-Za-z0-9_-]/.test(character) ? character : `u${character.codePointAt(0)?.toString(16)}`).join('');
  return `rm-connect-${ascii}`.slice(0, 120);
}
