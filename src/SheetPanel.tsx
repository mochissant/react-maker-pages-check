// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import React, { useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { animateElement, animationOptions, panelDefaults, panelFrames } from './motion.ts';
import type { ElementMotion, ScreenData } from './model-types.ts';
import { closeOverlayNode, useOverlayLifecycle } from './useOverlayLifecycle.ts';

type SheetPanelProps = {
  closeRef: MutableRefObject<(() => Promise<void>) | null>;
  screen: Pick<ScreenData, 'id' | 'name'>;
  settings?: ElementMotion | null;
  onClose: () => void;
  children?: ReactNode;
  backgroundColor?: string;
  closeLocked?: boolean;
  trialClose?: boolean;
};

export function SheetPanel({ closeRef, screen, settings, onClose, children, backgroundColor, closeLocked = false, trialClose = false }: SheetPanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const activeAnimations = useRef<Animation[]>([]);
  const closing = useRef(false);
  const mounted = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  useOverlayLifecycle(dialog, { modal: true, dismissArea: panel, outsideClose: !closeLocked, escapeClose: !closeLocked, onDismiss: () => void close() });

  function play(direction: 'open' | 'close') {
    const transition = { ...panelDefaults[direction], ...settings?.[direction] };
    const frames = panelFrames(transition, direction === 'close');
    const view = panel.current?.ownerDocument.defaultView;
    if (direction === 'close' && view && panel.current && backdrop.current && activeAnimations.current.some(({ playState }) => playState !== 'finished')) {
      const panelStyle = view.getComputedStyle(panel.current);
      frames.panel[0] = { opacity: panelStyle.opacity, transform: panelStyle.transform };
      frames.panel[1].transform ??= 'none';
      frames.backdrop[0] = { opacity: view.getComputedStyle(backdrop.current).opacity };
    }
    for (const animation of activeAnimations.current) animation.cancel();
    activeAnimations.current = ['backdrop', 'panel'].flatMap((layer) => {
      const node = layer === 'panel' ? panel.current : backdrop.current;
      const options = animationOptions(transition, layer === transition.first ? 0 : transition.delay);
      return animateElement(node, layer === 'panel' ? frames.panel : frames.backdrop, options) ?? [];
    });
    return Promise.allSettled(activeAnimations.current.map((animation) => animation.finished));
  }

  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return undefined;
    mounted.current = true;
    node.querySelector<HTMLButtonElement>('button')?.focus();
    const view = node.ownerDocument.defaultView;
    const trialFrame = trialClose && view ? view.requestAnimationFrame(() => void close()) : null;
    if (!trialClose) void play('open');
    return () => {
      if (trialFrame !== null) view?.cancelAnimationFrame(trialFrame);
      mounted.current = false;
      for (const animation of activeAnimations.current) animation.cancel();
    };
  }, []);

  async function close() {
    if (closeLocked || closing.current) return;
    closing.current = true;
    setIsClosing(true);
    await play('close');
    if (mounted.current) { closeOverlayNode(dialog.current); onClose(); }
  }

  useLayoutEffect(() => {
    closeRef.current = close;
    return () => { closeRef.current = null; };
  });

  return <dialog ref={dialog} className="cart-dialog" data-screen-id={screen.id} aria-label={screen.name || 'カート'}>
    <div ref={backdrop} className="cart-backdrop" aria-hidden="true" />
    <div ref={panel} className="cart-panel" style={backgroundColor ? { backgroundColor } : undefined}>
      <div className="cart-panel-header">
        <h2>{screen.name || 'カート'}</h2>
        <button type="button" disabled={closeLocked} onClick={() => void close()}>閉じる</button>
      </div>
      <div className="cart-panel-body" inert={isClosing}>{children}</div>
    </div>
  </dialog>;
}
