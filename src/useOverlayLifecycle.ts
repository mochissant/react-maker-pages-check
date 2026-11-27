// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { tabbable } from 'tabbable';

type Options = {
  enabled?: boolean;
  modal: boolean;
  dismissArea?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  outsideClose?: boolean;
  escapeClose?: boolean;
  restoreFocus?: HTMLElement | null;
};

export function closeOverlayNode(node: HTMLElement | null) {
  if (!node) return;
  if (node.tagName === 'DIALOG') { const dialog = node as HTMLDialogElement; if (dialog.open) dialog.close(); }
  else if (typeof node.hidePopover === 'function' && node.hasAttribute('popover') && node.matches(':popover-open')) node.hidePopover();
}

/** showModal() の背景の無効化を保ち、TabでブラウザーのUIへ抜けずに端を循環する。 */
function loopModalFocus(event: KeyboardEvent, dialog: HTMLDialogElement) {
  if (event.defaultPrevented || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !dialog.open) return;
  const target = event.target as Element | null;
  if (target?.closest?.('dialog') !== dialog) return;
  let active = dialog.ownerDocument.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  const controls = tabbable(dialog, { getShadowRoot: true });
  const first = controls[0]; const last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
  if (active === dialog || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

/** 注文シート・メニュー・汎用画面で共有するネイティブの開閉。 */
export function useOverlayLifecycle(nodeRef: RefObject<HTMLElement | null>, options: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
    const node = nodeRef.current;
    const closedBy = options.escapeClose === false ? 'none' : 'closerequest';
    if (node?.tagName === 'DIALOG' && node.getAttribute('closedby') !== closedBy) node.setAttribute('closedby', closedBy);
  });
  useLayoutEffect(() => {
    if (options.enabled === false) return;
    const node = nodeRef.current;
    if (!node) return;
    const document = node.ownerDocument;
    const opener = options.restoreFocus ?? document.activeElement as HTMLElement | null;
    const dialog = node.tagName === 'DIALOG' ? node as HTMLDialogElement : null;
    const popover = !dialog && typeof node.showPopover === 'function';
    // クリックでボタンへフォーカスしない環境でも、ネイティブの復帰先を確定する。
    if (dialog && options.restoreFocus?.isConnected) options.restoreFocus.focus({ preventScroll: true });
    if (dialog) dialog.showModal();
    else if (popover) { node.setAttribute('popover', 'manual'); node.showPopover(); }
    else node.dataset.overlayFallback = '';
    let pressedOutside = false;
    // 入れ子の重ねる画面（Issue #249）：上に別の重ねる画面が開いているあいだは、外側クリック・Tab の循環・Escape に反応しない（最前面だけ）
    const topmost = () => {
      const popoverOpen = (item: HTMLElement) => { try { return item.matches(':popover-open'); } catch { return false; } };
      const open = [...document.querySelectorAll<HTMLElement>('.rm-overlay')].filter((item) => (item as HTMLDialogElement).open || popoverOpen(item) || item.dataset.overlayFallback !== undefined);
      return !open.length || open.at(-1) === node;
    };
    const outside = (event: PointerEvent) => topmost() && !(latest.current.dismissArea?.current ?? node).contains(event.target as Node);
    const down = (event: PointerEvent) => { pressedOutside = outside(event); };
    const up = (event: PointerEvent) => { if (pressedOutside && outside(event) && latest.current.outsideClose !== false) latest.current.onDismiss(); pressedOutside = false; };
    const cancel = (event: Event) => { event.preventDefault(); if (latest.current.escapeClose !== false) latest.current.onDismiss(); };
    const key = (event: KeyboardEvent) => {
      if (!topmost()) return;
      if (latest.current.modal && dialog) loopModalFocus(event, dialog);
      if (!latest.current.modal && event.key === 'Escape' && latest.current.escapeClose !== false) { event.preventDefault(); latest.current.onDismiss(); }
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('keydown', key);
    node.addEventListener('cancel', cancel);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('keydown', key);
      node.removeEventListener('cancel', cancel);
      const focus = document.activeElement;
      const shouldRestore = focus === document.body || focus === node || Boolean(focus && node.contains(focus));
      closeOverlayNode(node);
      node.removeAttribute('popover');
      // 非モーダルと、非同期アクションから開いた画面でも呼び出し元へ戻す。
      if (shouldRestore && opener && opener !== document.body) {
        document.defaultView?.requestAnimationFrame(() => {
          if (opener.isConnected && (document.activeElement === document.body || document.activeElement === opener)) opener.focus({ preventScroll: true });
        });
      }
    };
  }, [options.enabled]);
}
