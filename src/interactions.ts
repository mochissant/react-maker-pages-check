// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { Interaction, SiteAction } from './model-types.ts';
import { isStateValue, type StateAction } from './state-logic.ts';

export type SiteActionContext = {
  screenId: string;
  elementId: string;
  argument: string;
  source: HTMLElement;
  form: HTMLFormElement | null;
  signal?: AbortSignal;
};
export type SiteActionHandlers = Record<string, (context: SiteActionContext) => void | Promise<void>>;
const formSubmissions = new WeakMap<HTMLFormElement, Promise<boolean>>();
/** 標準フォームの非同期処理を、後続の通知などが待つための接続口。 */
export function trackFormSubmission(form: HTMLFormElement, submission: Promise<boolean>) { formSubmissions.set(form, submission); }
/** 通知の出し方（Issue #241） */
export type ToastOptions = { tone?: 'info' | 'success' | 'error'; componentId?: string; duration?: number };
export type ActionRuntime = {
  source: HTMLElement;
  screenId: string;
  elementId: string;
  navigate: (id: string) => void;
  back: () => void;
  openOverlay: (id: string) => void;
  closeOverlay: () => void | Promise<void>;
  updateState: (action: StateAction) => void;
  notify: (message: string, options?: boolean | ToastOptions) => void;
  /** 自作の通知の部品の「閉じる」（Issue #241）。source を含む通知を閉じる */
  dismissToast?: (source: HTMLElement) => void;
  handlers: SiteActionHandlers;
  signal?: AbortSignal;
};

/** 相対URLとhttp(s)だけを外部リンクとして扱う。電話とメールは専用の動作を使う。 */
export function safeLink(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0020\u007f\\]/.test(value.trim())) return null;
  const text = value.trim();
  try {
    const url = new URL(text, 'https://react-maker.invalid/');
    return ['http:', 'https:'].includes(url.protocol) ? text : null;
  } catch { return null; }
}

export function actionHref(action: SiteAction): string | null {
  if (action.type === 'link') return safeLink(action.url);
  if (action.type === 'phone') return /^\+?[0-9() .-]+$/.test(action.value) ? `tel:${action.value.replace(/[() .-]/g, '')}` : null;
  if (action.type === 'email') return /^[^\s@<>?]+@[^\s@<>?]+\.[^\s@<>?]+$/.test(action.value) ? `mailto:${encodeURIComponent(action.value).replace('%40', '@')}` : null;
  return null;
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 10000;
const id = (value: unknown): value is string => text(value) && value.length > 0 && value.length <= 200;
export function validAction(value: unknown): value is SiteAction {
  if (!object(value)) return false;
  switch (value.type) {
    case 'navigate': case 'openOverlay': return id(value.screenId);
    case 'back': case 'closeOverlay': return true;
    case 'setState': return id(value.stateId) && isStateValue(value.value);
    case 'toggleState': return id(value.stateId);
    case 'incrementState': return id(value.stateId) && typeof value.amount === 'number' && Number.isFinite(value.amount);
    case 'link': return Boolean(safeLink(value.url)) && (value.newTab === undefined || typeof value.newTab === 'boolean');
    case 'phone': case 'email': return text(value.value) && Boolean(actionHref(value as SiteAction));
    case 'copy': return text(value.value);
    case 'toast': return text(value.value) && (value.componentId === undefined || id(value.componentId))
      && (value.tone === undefined || (typeof value.tone === 'string' && ['info', 'success', 'error'].includes(value.tone)))
      && (value.duration === undefined || (typeof value.duration === 'number' && Number.isFinite(value.duration) && value.duration >= 0 && value.duration <= 60000));
    case 'dismissToast': return true;
    case 'scroll': return id(value.targetId) && (value.smooth === undefined || typeof value.smooth === 'boolean') && (value.current === undefined || typeof value.current === 'boolean');
    case 'playMotion': return id(value.targetId);
    case 'submit': case 'reset': return value.targetId === undefined || id(value.targetId);
    case 'call': return id(value.name) && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value.name) && (value.argument === undefined || text(value.argument));
    default: return false;
  }
}
export function validInteractions(value: unknown): value is Interaction[] {
  if (!Array.isArray(value) || value.length > 50) return false;
  const seen = new Set<string>();
  return value.every((entry: unknown) => {
    if (!object(entry) || !id(entry.id) || seen.has(entry.id) || typeof entry.trigger !== 'string' || !['click', 'hover', 'focus', 'visible', 'key'].includes(entry.trigger)) return false;
    seen.add(entry.id);
    return (entry.trigger !== 'key' || id(entry.key)) && Array.isArray(entry.actions) && entry.actions.length > 0 && entry.actions.length <= 50 && entry.actions.every(validAction);
  });
}

export function clickLink(interactions: Interaction[] | undefined): SiteAction | null {
  const clicks = interactions?.filter(({ trigger }) => trigger === 'click') ?? [];
  if (clicks.length !== 1 || clicks[0].actions.length !== 1) return null;
  const action = clicks[0].actions[0];
  return action.type === 'navigate' || actionHref(action) ? action : null;
}

export function remapInteractions(interactions: Interaction[] | undefined, screenIds: Map<string, string | null>, elementIds = new Map<string, string>()): Interaction[] | undefined {
  if (!interactions) return undefined;
  const targetId = (id: string) => {
    if (elementIds.has(id)) return elementIds.get(id)!;
    const [instance, ...part] = id.split('/');
    return part.length && elementIds.has(instance) ? `${elementIds.get(instance)}/${part.join('/')}` : id;
  };
  return interactions.flatMap((entry) => {
    const actions = entry.actions.flatMap((action): SiteAction[] => {
      if ((action.type === 'navigate' || action.type === 'openOverlay') && screenIds.has(action.screenId)) {
        const id = screenIds.get(action.screenId); return id ? [{ ...action, screenId: id }] : [];
      }
      if (['scroll', 'submit', 'reset', 'playMotion'].includes(action.type) && 'targetId' in action && action.targetId) return [{ ...action, targetId: targetId(action.targetId) }];
      return [action];
    });
    return actions.length ? [{ ...entry, actions }] : [];
  });
}

function target(source: HTMLElement, targetId: string): HTMLElement {
  const scope = source.closest('[data-screen-id]') ?? source.ownerDocument;
  const found = scope.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(targetId)}"]`);
  if (!found) throw new Error('操作の対象が見つかりません。');
  return found;
}
/** 上に貼り付いている見出し（sticky・fixed のヘッダー）の下端。対象がその中なら 0 */
function stickyTopOffset(element: HTMLElement, view: Window): number {
  const document = element.ownerDocument;
  let offset = 0;
  for (const hit of document.elementsFromPoint(view.innerWidth / 2, 1)) {
    for (let node: Element | null = hit; node && node !== document.documentElement; node = node.parentElement) {
      const { position } = view.getComputedStyle(node);
      if (position !== 'sticky' && position !== 'fixed') continue;
      if (node.contains(element)) return 0;
      const bottom = node.getBoundingClientRect().bottom;
      if (bottom > 0 && bottom < view.innerHeight / 2) offset = Math.max(offset, bottom);
    }
  }
  return offset;
}

/**
 * 要素へスクロール：ページの中なら、貼り付いたヘッダーの下に見出しが来るよう、ページだけをスクロールする（#232）。
 * scrollIntoView はプレビューを入れた編集画面までスクロールし、ヘッダーの下に見出しが隠れていた。重ねる画面などスクロールする箱の中は scrollIntoView のまま
 */
function scrollToElement(element: HTMLElement, view: Window, behavior: ScrollBehavior): void {
  for (let node = element.parentElement; node && node !== element.ownerDocument.body; node = node.parentElement) {
    const { overflowY } = view.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      element.scrollIntoView({ behavior, block: 'start' });
      return;
    }
  }
  const top = element.getBoundingClientRect().top + view.scrollY - stickyTopOffset(element, view);
  view.scrollTo({ top: Math.max(0, top), behavior });
}

function formFor(runtime: ActionRuntime, targetId?: string): HTMLFormElement | null {
  const element = targetId ? target(runtime.source, targetId) : runtime.source;
  return element.matches('form') ? element as HTMLFormElement : element.querySelector<HTMLFormElement>('form') ?? element.closest<HTMLFormElement>('form');
}

/** 途中で失敗したら後続を実行しない。非同期の手書き処理も同じ順序で待つ。 */
export async function performActions(actions: SiteAction[], runtime: ActionRuntime): Promise<void> {
  const document = runtime.source.ownerDocument;
  const view = document.defaultView;
  if (!view) return;
  try {
    for (const action of actions) {
      if (runtime.signal?.aborted) return;
      if (!validAction(action)) throw new Error('操作の設定を確認してください。');
      switch (action.type) {
        case 'navigate': runtime.navigate(action.screenId); break;
        case 'openOverlay': runtime.openOverlay(action.screenId); break;
        case 'closeOverlay': await runtime.closeOverlay(); break;
        case 'setState': case 'toggleState': case 'incrementState': runtime.updateState(action); break;
        case 'back': runtime.back(); break;
        case 'link': case 'phone': case 'email': {
          const href = actionHref(action);
          if (!href) throw new Error('リンクの設定を確認してください。');
          if (action.type === 'link' && action.newTab) view.open(href, '_blank', 'noopener,noreferrer');
          else view.location.assign(href);
          break;
        }
        case 'scroll': {
          const element = target(runtime.source, action.targetId);
          const reduced = document.documentElement.dataset.reducedMotion === 'reduce' || view.matchMedia('(prefers-reduced-motion: reduce)').matches;
          scrollToElement(element, view, action.smooth !== false && !reduced ? 'smooth' : 'instant');
          const previous = element.getAttribute('tabindex');
          if (previous === null) element.tabIndex = -1;
          element.focus({ preventScroll: true });
          if (previous === null) element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
          break;
        }
        // 動きを再生（Issue #161）：対象の要素の「操作から再生」の動きに知らせる
        case 'playMotion': target(runtime.source, action.targetId).dispatchEvent(new view.CustomEvent('rm:play')); break;
        case 'copy': await view.navigator.clipboard.writeText(action.value); break;
        case 'toast': runtime.notify(action.value, { tone: action.tone, componentId: action.componentId, duration: action.duration }); break;
        case 'dismissToast': runtime.dismissToast?.(runtime.source); break;
        case 'submit': case 'reset': {
          const form = formFor(runtime, action.targetId);
          if (!form) throw new Error('操作の対象のフォームが見つかりません。');
          if (action.type === 'reset') form.reset();
          else {
            if (!form.reportValidity()) return;
            formSubmissions.delete(form);
            form.requestSubmit();
            const submission = formSubmissions.get(form);
            if (submission && !(await submission)) return;
            formSubmissions.delete(form);
          }
          break;
        }
        case 'call': {
          if (!Object.hasOwn(runtime.handlers, action.name)) throw new Error(`処理「${action.name}」が登録されていません。`);
          await runtime.handlers[action.name]({ screenId: runtime.screenId, elementId: runtime.elementId, argument: action.argument ?? '', source: runtime.source, form: formFor(runtime), signal: runtime.signal });
          break;
        }
      }
    }
  } catch (error) {
    if (!runtime.signal?.aborted) runtime.notify(error instanceof Error ? error.message : '操作に失敗しました。', true);
  }
}
