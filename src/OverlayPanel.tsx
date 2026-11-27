// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import React, { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { animateElement } from './motion.ts';
import { overlayDefaults } from './overlay.ts';
import { closeOverlayNode, useOverlayLifecycle } from './useOverlayLifecycle.ts';
import type { ScreenData } from './model-types.ts';

type Props = {
  screen: ScreenData;
  onClose: () => void;
  closeRef: MutableRefObject<(() => Promise<void>) | null>;
  anchor?: HTMLElement | null;
  backgroundColor?: string;
  fixed?: boolean;
  editing?: boolean;
  contentStyle?: CSSProperties;
  children?: ReactNode;
};
export function OverlayPanel({ screen, onClose, closeRef, anchor, backgroundColor, fixed = false, editing = false, contentStyle, children }: Props) {
  const settings = { ...overlayDefaults(screen.overlay!.kind), ...screen.overlay };
  const modal = settings.kind === 'modal' || settings.kind === 'sheet';
  const node = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const mounted = useRef(false);
  const closing = useRef(false);
  const [paused, setPaused] = useState(false);
  const [anchorPosition, setAnchorPosition] = useState<CSSProperties>({});
  function frames(close: boolean): Keyframe[] {
    const hidden: Keyframe = { opacity: 0 };
    if (settings.motion === 'slide') hidden.transform = settings.position === 'left' ? 'translateX(-40px)' : settings.position === 'right' ? 'translateX(40px)' : `translateY(${settings.position === 'top' ? -24 : 24}px)`;
    if (settings.motion === 'scale') hidden.transform = 'scale(.94)';
    // ぽよん（#232）：小さく出て、少し大きく弾んでから落ち着く。閉じるときは弾まない
    if (settings.motion === 'poyon') {
      hidden.transform = 'scale(.6)';
      if (!close) return [hidden, { opacity: 1, transform: 'scale(1.06)', offset: 0.55 }, { opacity: 1, transform: 'scale(.98)', offset: 0.8 }, { opacity: 1, transform: 'none' }];
    }
    return close ? [{ opacity: 1, transform: 'none' }, hidden] : [hidden, { opacity: 1, transform: 'none' }];
  }
  function play(close: boolean) {
    animation.current?.cancel();
    animation.current = !editing && settings.motion !== 'none' ? animateElement(panel.current, frames(close), { duration: close ? 140 : settings.motion === 'poyon' ? 420 : 200, easing: 'ease-out', fill: 'both' }) : null;
    return animation.current?.finished.catch(() => {});
  }
  async function close() {
    if (fixed || editing || closing.current) return;
    closing.current = true;
    await play(true);
    if (mounted.current) { closeOverlayNode(node.current); onClose(); }
  }
  useOverlayLifecycle(node, { enabled: !editing, modal, dismissArea: modal ? panel : undefined, onDismiss: () => void close(), outsideClose: !fixed && settings.outsideClose, escapeClose: !fixed && settings.escapeClose, restoreFocus: anchor });
  useLayoutEffect(() => {
    mounted.current = true;
    const element = node.current;
    // 編集用のdialogは通常レイヤーに置き、選択・余白・Gridの取っ手を上へ描けるようにする。
    if (editing && modal) (element as HTMLDialogElement | null)?.show();
    if (!editing && modal) panel.current?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href]')?.focus();
    void play(false);
    return () => { mounted.current = false; animation.current?.cancel(); if (editing) closeOverlayNode(element); };
  }, []);
  useLayoutEffect(() => { closeRef.current = close; return () => { closeRef.current = null; }; });
  useLayoutEffect(() => {
    if (settings.position !== 'anchor' || !anchor) return;
    const view = anchor.ownerDocument.defaultView;
    if (!view) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(settings.width ?? 480, view.innerWidth - 24);
      const height = panel.current?.getBoundingClientRect().height ?? 0;
      const top = rect.bottom + 8 + height <= view.innerHeight - 12 ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
      setAnchorPosition({ left: Math.max(12, Math.min(rect.left, view.innerWidth - width - 12)), top });
    };
    update(); view.addEventListener('resize', update); view.addEventListener('scroll', update, true);
    const observer = new ResizeObserver(update); if (panel.current) observer.observe(panel.current);
    return () => { view.removeEventListener('resize', update); view.removeEventListener('scroll', update, true); observer.disconnect(); };
  }, [settings.position, settings.width, anchor]);
  useEffect(() => {
    if (settings.kind !== 'toast' || !settings.duration || fixed || editing || paused) return;
    const timer = setTimeout(() => void close(), settings.duration);
    return () => clearTimeout(timer);
  }, [settings.duration, settings.kind, fixed, editing, paused]);
  const content = <div ref={panel} className="rm-overlay-panel" style={backgroundColor ? { backgroundColor } : undefined}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}>
    <div className="rm-overlay-header"><h2>{screen.name}</h2><button type="button" aria-label={`${screen.name}を閉じる`} disabled={fixed || editing} onClick={() => void close()}>閉じる</button></div>
    <div className="rm-overlay-body" style={contentStyle}>{children}</div>
  </div>;
  const props = { className: 'rm-overlay', 'data-kind': settings.kind, 'data-editing': editing ? '' : undefined, 'data-position': settings.position, 'data-scroll-lock': settings.scrollLock ? '' : undefined,
    'data-screen-id': screen.id, 'aria-label': screen.name, style: { '--overlay-width': `${settings.width}px`, ...anchorPosition } as CSSProperties };
  return modal ? <dialog {...props} ref={(value) => { node.current = value; }}><div className="rm-overlay-backdrop" data-dim={settings.backdrop ? '' : undefined} aria-hidden="true" />{content}</dialog>
    : <div {...props} ref={(value) => { node.current = value; }} role={!editing && settings.kind === 'toast' ? 'status' : 'region'}>{content}</div>;
}
