// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { OverlaySettings } from './model-types.ts';

export const overlayLabels = { modal: 'モーダル', sheet: 'シート', popover: 'ポップオーバー', toast: 'トースト' };
export function overlayDefaults(kind: OverlaySettings['kind']): OverlaySettings {
  const blocking = kind === 'modal' || kind === 'sheet';
  return { kind, position: kind === 'sheet' || kind === 'toast' ? 'bottom' : kind === 'popover' ? 'anchor' : 'center',
    width: kind === 'sheet' ? 640 : kind === 'toast' ? 360 : 480, backdrop: blocking,
    outsideClose: kind !== 'toast', escapeClose: true, scrollLock: blocking,
    motion: kind === 'sheet' ? 'slide' : kind === 'modal' ? 'scale' : 'fade', history: false, duration: kind === 'toast' ? 5000 : 0 };
}
export function validOverlay(value: unknown): value is OverlaySettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.kind === 'string' && Object.hasOwn(overlayLabels, item.kind)
    && (item.position === undefined || typeof item.position === 'string' && ['center', 'top', 'bottom', 'left', 'right', 'anchor'].includes(item.position))
    && (item.width === undefined || typeof item.width === 'number' && Number.isFinite(item.width) && item.width >= 160 && item.width <= 2400)
    && (item.motion === undefined || typeof item.motion === 'string' && ['fade', 'slide', 'scale', 'poyon', 'none'].includes(item.motion))
    && ['backdrop', 'outsideClose', 'escapeClose', 'scrollLock', 'history'].every((key) => item[key] === undefined || typeof item[key] === 'boolean')
    && (item.duration === undefined || typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration >= 0 && item.duration <= 60000);
}
