// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { PanelMotion } from './model-types.ts';

export const defaultEasing = [0.2, 0, 0.2, 1];
export const panelDefaults: { open: PanelMotion; close: PanelMotion } = {
  open: { effect: 'slide-fade', duration: 260, delay: 45, distance: 64, easing: defaultEasing, first: 'backdrop' },
  close: { effect: 'slide-fade', duration: 200, delay: 30, distance: 64, easing: defaultEasing, first: 'panel' },
};
export const feedbackDefaults: PanelMotion = { effect: 'pulse', duration: 240, delay: 0, distance: 8, easing: defaultEasing };

export function isEasing(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite)
    && value[0] >= 0 && value[0] <= 1 && value[2] >= 0 && value[2] <= 1;
}

export function animationOptions(settings: PanelMotion, delay = settings.delay): KeyframeAnimationOptions {
  return { duration: settings.duration, delay, easing: `cubic-bezier(${(isEasing(settings.easing) ? settings.easing : defaultEasing).join(',')})`,
    fill: 'both' };
}

export function panelFrames(settings: PanelMotion, closing: boolean) {
  const offscreen: Keyframe = { opacity: 0 };
  if (settings.effect === 'slide-fade') offscreen.transform = `translateY(${settings.distance}px)`;
  const resting: Keyframe = { opacity: 1 };
  if (settings.effect === 'slide-fade') resting.transform = 'translateY(0)';
  const backdrop: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
  const panel = [offscreen, resting];
  return closing ? { panel: panel.reverse(), backdrop: backdrop.reverse() } : { panel, backdrop };
}

export function feedbackFrames(settings: PanelMotion): Keyframe[] {
  if (settings.effect === 'slide') return [
    { transform: 'translateY(0)' },
    { transform: `translateY(-${settings.distance}px)` },
    { transform: 'translateY(0)' },
  ];
  return [{ scale: '1' }, { scale: '1.08' }, { scale: '1' }];
}

export function animateElement(element: Element | null | undefined, frames: Keyframe[], options: KeyframeAnimationOptions) {
  if (!element || typeof element.animate !== 'function' || element.ownerDocument.documentElement?.dataset?.reducedMotion === 'reduce' ||
    element.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  return element.animate(frames, options);
}
