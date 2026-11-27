// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type FocusEvent, type HTMLAttributes, type MutableRefObject, type ReactNode } from 'react';
import { ControlView } from './ControlView';
import { ComboboxView, type ComboboxControl, type ComboboxRenderer } from './ComboboxView';
import { isNativeControl, isLayoutElement, validControl } from './controls.ts';
import { materializeElements, resolveBackground, resolveElement, tokenLiteral } from './design-system.ts';
import { connectName, smartMotion, smartStyle } from './smart-animate.ts';
import { bindElement, pickRecord, repeatRecords, type DataRow } from './data-binding.ts';
import { flushSync } from 'react-dom';
import { applyConditionalStyle, elementStyle } from './responsive.ts';
import { stateRules, stateStyle } from './state-styles.ts';
import { BackgroundVideo, validBackgroundVideo } from './BackgroundVideo.tsx';
import { attachMotions, playExit, playOnce, playTimeline, prefersReducedMotion, splitText } from './element-motion.ts';
import { resolveAssetSrc } from './assets.ts';
import { screenSignature, styleSignature } from './style-signature.ts';
import { IconSvg } from './IconSvg.tsx';
import { DataBlock } from './DataBlocks.tsx';
import { datasetsForScenario, productsFor, productsFromDatasets } from './data.ts';
import { SheetPanel } from './SheetPanel.tsx';
import { OverlayPanel } from './OverlayPanel.tsx';
import { stateResults } from './state-expressions.ts';
import { actionHref, clickLink, performActions, validInteractions } from './interactions.ts';
import type { ToastOptions } from './interactions.ts';
import { siteActionHandlers } from './integrations/site-actions';
import { siteRoutes } from './routes.ts';
import { blockTag, elementBlocks, isStructured, proseClass, safeUrl, textTag } from './rich-text.ts';
import { RichTextEditor } from './RichTextEditor.tsx';
import type { RichBlock, RichSpan } from './model-types.ts';
import { ScreenImage } from './ScreenImage.tsx';
import { StatusMessage } from './StatusMessage.tsx';
import { animateElement, animationOptions, feedbackDefaults, feedbackFrames } from './motion.ts';
import { registeredComponents as customComponents } from './integrations/registered-components';
import { ComponentSession, useComponentStateStore } from './integrations/component-runtime';
import { nextStateValue, screenStateSlots, stateSlots, validStateValue } from './state-logic.ts';
import type {
  BackgroundSetting, Breakpoint, DataField, DataScenario, DatasetData, DesignSystemData, ElementAnimation, ElementData, Interaction, PanelMotion, ProductData, ScreenData, StateValue, StatusMessages,
} from './model-types.ts';
import type { OrderAction, OrderApi, OrderRuntime, OrderScenario, OrderState } from './order-types.ts';

const emptyProducts: never[] = [];

type Records = Record<string, string>;
/** 設定パネルからの試し再生（パネルの開閉・追加の反応） */
type PanelTrial = { screenId: string; kind: 'feedback' | 'open' | 'close'; element: ElementData; sequence?: number };
type MotionTrial = { elementId: string; animation: ElementAnimation } | { timeline: true };
type CartPanel = { sourceId: string; element: ElementData; anchor?: HTMLElement; trialClose?: boolean; sequence?: number };
/** 重ねる画面の中から開いた、さらに上に重ねる画面（Issue #249）。下から順に積む */
type NestedOverlay = { id: string; anchor?: HTMLElement; history: boolean; sequence: number };
/** 要素を描く画面：false は画面、true はいちばん下の重ねる画面、画面のデータは積んだ重ねる画面 */
type PanelOwner = boolean | ScreenData;
type Placement = 'inside' | 'before' | 'after';
type DropTarget = { id: string; placement: Placement };
type ElementClasses = Record<string, Record<string, string> | undefined>;

export type ScreenViewProps = {
  screen: ScreenData | undefined;
  /** edit：編集GUIのキャンバス。interact：操作モードと書き出したサイト */
  mode: 'edit' | 'interact';
  selectedId?: string | null;
  selectedIds?: string[];
  onSelect?: (id: string, options: { additive: boolean }) => void;
  /** records は、選んでいるレコード（データ一覧のID → レコードのID） */
  onNavigate: (screenId: string, records: Records) => void;
  onRelocate?: (id: string, targetId: string, placement: Placement) => void;
  design?: DesignSystemData | null;
  breakpoints?: Breakpoint[];
  products?: ProductData[];
  productFields?: DataField[];
  datasets?: DatasetData[];
  /** データの状態（読み込み中・失敗）とプレビュー条件。Issue #117 */
  scenarios?: Record<string, DataScenario | undefined>;
  onRetryDataset?: (id: string) => void;
  orderScenario?: OrderScenario | null;
  api?: OrderApi | null;
  screens?: ScreenData[];
  startScreenId?: string | null;
  trial?: PanelTrial | null;
  inspect?: boolean;
  elementClasses?: ElementClasses;
  /** 書き出し時のスタイルの署名。合わない要素はクラスを使わない（Issue #116） */
  elementSignatures?: ElementClasses;
  onOpenComponent?: (componentId: string) => void;
  background?: BackgroundSetting;
  componentPreview?: boolean;
  componentConditions?: Record<string, Record<string, unknown> | undefined>;
  routeRecords?: Records;
  textEditId?: string | null;
  onTextEdit?: (id: string) => void;
  onTextCommit?: (id: string, text: string, richText?: RichBlock[]) => void;
  forcedState?: { id: string; state: string } | null;
  contentMaxWidth?: number;
  motionTrial?: MotionTrial | null;
  /** 画面の URL の頭（多言語のサイトでは /en/ など。Issue #182）。既定は BASE_URL */
  basePath?: string;
  reducedMotion?: boolean;
  /** 編集中もスクロールのスナップを効かせる（Issue #248。表示の切り替え） */
  snapWhileEditing?: boolean;
  assetUrls?: Record<string, string>;
  panelHistory?: boolean;
  fixedOverlay?: boolean;
  statePreview?: { revision: number; values: Record<string, StateValue> };
  /** Controlled values for authored Combobox roots (exported shared component props). */
  comboboxControls?: Record<string, ComboboxControl | undefined>;
};

/** 登録した React 部品の描画（integrations/components.tsx の defineComponent） */
type RegisteredView = ComponentType<{
  values: Record<string, unknown>;
  /** 部品の中で変わった値を、画面の状態へ返す（Issue #242。valueLinks でつないだ項目だけ） */
  onValueChange?: (name: string, value: unknown) => void;
  datasetsById: Map<string, DatasetData>;
  assetUrls?: Record<string, string>;
  preview: boolean;
  statusMessages?: StatusMessages;
  conditions?: unknown;
  interactive: boolean;
  onActivate: () => void;
  children?: ReactNode;
}>;

/** 書き出した共通部品（src/components/shared/。Issue #107） */
type SharedEntry = {
  Component: ComponentType<Record<string, unknown> & { children?: ReactNode }>;
  variants: Record<string, string | undefined>;
  parts: Record<string, { text?: string; src?: string; alt?: string; press?: string } | undefined>;
};
/** 書き出した画面ごとの TSX（src/screens/。Issue #106） */
type GeneratedScreen = { signature: string; Component: ComponentType<{ element: (id: string) => ReactNode }> };

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const iconSize = (element: ElementData, fallback: number) => (isNumber(element.iconSize) ? element.iconSize : fallback);
const headingTag = (level: unknown) => `h${typeof level === 'number' && [1, 2, 3, 4, 5, 6].includes(level) ? level : 2}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

function findElement(elements: ElementData[] | undefined, id: string | undefined): ElementData | null {
  for (const element of elements ?? []) {
    if (element.id === id) return element;
    const inner = findElement(element.children, id);
    if (inner) return inner;
  }
  return null;
}

/**
 * 注文の機能は order-runtime.tsx にある。注文を使わないサイトの書き出しにはこのファイルが無く、注文の部品は描かない（Issue #109）
 */
const orderModules = import.meta.glob<OrderRuntime>('./order-runtime.tsx', { eager: true });
const orderRuntime = orderModules['./order-runtime.tsx'] as OrderRuntime | undefined;
const noOrder: OrderState = {
  catalog: { products: emptyProducts, loading: false }, summary: { count: 0, total: 0, lines: [] }, pending: false, orderOutcomeUnknown: false,
  error: '', quote: null, receipt: null, actionState: undefined, run: async () => {}, clearError: () => {}, setQuantity: () => {}, retry: () => {}, retryCatalog: () => {},
};
const useOrder = orderRuntime?.useOrder ?? (() => noOrder);

/**
 * 書き出したサイトでは、共通部品をコンポーネント（src/components/shared/。Issue #107）として描く。
 * 配置の上書きが props で表せないとき（スタイルの上書き・動き・パネルなど）は、これまでどおり展開して描く
 */
const sharedModules = import.meta.glob<Record<string, SharedEntry>>('./components/shared/index.ts', { eager: true, import: 'sharedComponents' });
const sharedComponents = sharedModules['./components/shared/index.ts'] as Record<string, SharedEntry | undefined> | undefined;
// 画面ごとの TSX（src/screens/。Issue #106）。書き出したサイトにだけある
const screenModules = import.meta.glob<Record<string, GeneratedScreen>>('./screens/index.ts', { eager: true, import: 'screenComponents' });
const generatedScreens = screenModules['./screens/index.ts'] as Record<string, GeneratedScreen | undefined> | undefined;
/** 画面に、合計を読み上げる注文の部品（商品一覧・カート）があるか */
const showsOrderTotal = (elements: ElementData[] | undefined): boolean => (elements ?? []).some(({ type, children }) => type === 'catalog' || type === 'cart' || showsOrderTotal(children));
const instanceKeys = new Set(['id', 'type', 'componentId', 'variantId', 'childOverrides', 'style', 'tokenRefs', 'name', 'targetScreenId', 'text', 'src', 'alt', 'children', 'action']);
const partKeys = new Set(['text', 'src', 'alt', 'targetScreenId', 'action']);
/** コードで足せる属性（screen-files.js の codeAttribute と同じ。Issue #89） */
const codeAttribute = /^(aria-[a-z-]+|data-(?!element-id$)[a-z0-9-]+|id|title|role|lang)$/;
const empty = (value: unknown) => value == null || (typeof value === 'object' && !Object.keys(value).length);
const hasOrderElements = orderRuntime?.hasOrderElements ?? (() => false);


/**
 * キャンバス上で文言を直接編集する（Issue #82）。ダブルクリックか Enter で始め、Esc・枠外のクリックで確定する。
 * 日本語入力の変換中の Enter・Esc では確定しない。複数行のテキストは Enter で改行、⌘/Ctrl+Enter で確定
 */
type EditableTextProps = { as: string; props: HTMLAttributes<HTMLElement>; text: string | undefined; multiline?: boolean; onCommit: (text: string) => void };

function EditableText({ as: Tag, props, text, multiline, onCommit }: EditableTextProps) {
  const node = useRef<HTMLElement>(null);
  const finished = useRef(false);
  useLayoutEffect(() => {
    const target = node.current;
    if (!target) return;
    target.focus();
    const range = target.ownerDocument.createRange();
    range.selectNodeContents(target);
    const selection = target.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);
  function finish() {
    if (finished.current) return;
    finished.current = true;
    onCommit((node.current?.innerText ?? '').replace(/\n$/, ''));
  }
  const { onClick, onPointerDown, ...rest } = props;
  // 見出し・段落・ボタンの文言のどれでも同じ要素として扱う（タグは呼び出し側が決める）
  const Element = Tag as unknown as ComponentType<HTMLAttributes<HTMLElement> & { ref: typeof node }>;
  return <Element {...rest} ref={node} contentEditable="plaintext-only" suppressContentEditableWarning role="textbox"
    aria-multiline={multiline} aria-label="文言を編集" data-text-editing=""
    onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}
    onBlur={finish} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      // 見出しも Shift＋Enter で改行できる（行ごとに現れる動きのため。Issue #120）
      if (event.key === 'Escape' || (event.key === 'Enter' && ((!multiline && !event.shiftKey) || event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        event.stopPropagation();
        finish();
      }
    }}>{text}</Element>;
}

/** 部品の表示に失敗しても、画面全体は表示し続ける（コードの部品の誤りなど。Issue #110） */
type BoundaryProps = { name: string; View: unknown; children?: ReactNode };
type BoundaryState = { error: unknown; View: unknown };

class PartBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, View: null };
  // 部品のコードを直したら（View が替わったら）表示し直す
  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState) { return props.View !== state.View ? { error: null, View: props.View } : null; }
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <p role="alert" className="rm-part-error">部品「{this.props.name}」を表示できませんでした：{String((this.state.error as { message?: unknown }).message ?? this.state.error)}</p>;
  }
}

/** 通知の1件（Issue #241） */
type ToastEntry = { id: number; text: string; tone: 'info' | 'success' | 'error'; duration: number; componentId?: string };
/**
 * 通知の1件。時間で消える（0 は閉じるまで）。マウスを乗せている間・中にフォーカスがある間は、時間を止める。
 * 通知はフォーカスを奪わない。失敗は alert、ほかは status で読み上げる
 */
function ToastItem({ entry, custom, onClose, children }: { entry: ToastEntry; custom: boolean; onClose: () => void; children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(entry.duration);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!entry.duration || paused) return undefined;
    const started = Date.now();
    const timer = setTimeout(() => close.current(), Math.max(0, remaining.current));
    return () => { clearTimeout(timer); remaining.current -= Date.now() - started; };
  }, [paused, entry.duration]);
  const role = entry.tone === 'error' ? 'alert' : 'status';
  return <div className={custom ? 'rm-action-toast-custom' : 'rm-action-toast'} data-rm-toast={entry.id} data-tone={entry.tone} data-error={entry.tone === 'error' ? '' : undefined}
    {...(custom ? { role } : {})}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}>
    {custom ? children : <><span role={role}>{entry.text}</span><button type="button" aria-label="通知を閉じる" onClick={onClose}>×</button></>}
  </div>;
}

/** 自作の通知の部品で、文言を入れる要素：名前が「通知の文言」のもの。無ければ最初の文章・見出し */
function toastMessagePart(root: ElementData | undefined): ElementData | undefined {
  const all: ElementData[] = [];
  (function visit(node?: ElementData) { if (!node) return; all.push(node); node.children?.forEach(visit); })(root);
  return all.find(({ name }) => name === '通知の文言') ?? all.find(({ type }) => type === 'text' || type === 'heading');
}
const toastVariantNames: Record<ToastEntry['tone'], string[]> = { info: ['情報', 'info'], success: ['成功', 'success'], error: ['失敗', 'エラー', 'error'] };

export function ScreenView(props: ScreenViewProps) {
  return <ComponentSession><ScreenContent {...props} /></ComponentSession>;
}

/** スクロールで隠す要素（Issue #248）：上に貼り付けた・固定した要素のうち、scrollHide を付けたもの */
function collectScrollHide(elements: ElementData[] | undefined, found: string[] = []): string[] {
  for (const element of elements ?? []) {
    if (element.style?.scrollHide && (element.style.position === 'sticky' || element.style.position === 'fixed')) found.push(element.id);
    collectScrollHide(element.children, found);
  }
  return found;
}

function ScreenContent({ screen, mode, selectedId, onSelect, onNavigate, onRelocate, design, breakpoints,
  products = emptyProducts, productFields = emptyProducts, datasets = emptyProducts, scenarios, onRetryDataset, orderScenario, api, screens = emptyProducts, trial,
  inspect, elementClasses, elementSignatures, onOpenComponent, background, componentPreview = false, componentConditions, routeRecords, textEditId, onTextEdit, onTextCommit, forcedState, contentMaxWidth, motionTrial, basePath, reducedMotion, selectedIds, assetUrls, startScreenId, panelHistory = false, fixedOverlay = false, statePreview, comboboxControls, snapWhileEditing = false }: ScreenViewProps) {
  const stateStore = useComponentStateStore();
  const editing = mode === 'edit';
  const [viewportWidth, setViewportWidth] = useState(0);
  const datasetsById = useMemo(() => new Map(datasetsForScenario(datasets, scenarios).map((dataset) => [dataset.id, dataset])), [datasets, scenarios]);
  const resultsFor = useMemo(() => {
    const cache = new WeakMap<ScreenData, ReturnType<typeof stateResults>>();
    return (owner: ScreenData) => {
      let values = cache.get(owner);
      if (!values) { values = stateResults(screenStateSlots(owner, design), stateStore.values, [...datasetsById.values()]); cache.set(owner, values); }
      return values;
    };
  }, [design, stateStore.values, datasetsById]);
  function stateValue(element: ElementData, owner: ScreenData, id: string): StateValue {
    const slot = stateSlots(element, owner, design).find(({ definition }) => definition.id === id);
    if (!slot) throw new Error('参照している状態が見つかりません。');
    const value = resultsFor(owner).get(slot.key)?.value;
    return validStateValue(slot.definition, value) ? value : slot.definition.initial;
  }
  /*
   * 取り込んだ部品の「値と変更」と、画面の状態をつなぐ（Issue #242）。element.valueLinks：部品の項目 → 画面の状態の id。
   * 画面の状態の値を部品の値にし、部品の中で変わったら画面の状態を変える（ほかの要素の表示・条件にも効く）
   */
  function linkedValues(element: ElementData, owner: ScreenData): Record<string, unknown> {
    const links = element.valueLinks;
    if (!links) return element.customValues ?? {};
    const values: Record<string, unknown> = { ...(element.customValues ?? {}) };
    for (const [name, stateId] of Object.entries(links)) {
      try { values[name] = stateValue(element, owner, stateId); } catch { /* つないだ状態が消えたら、部品の値のまま */ }
    }
    return values;
  }
  function linkValueChange(element: ElementData, owner: ScreenData, name: string, value: unknown) {
    const stateId = element.valueLinks?.[name];
    if (!stateId || editing) return;
    const slot = stateSlots(element, owner, design).find(({ definition }) => definition.id === stateId);
    if (slot && validStateValue(slot.definition, value)) stateStore.update(slot.key, () => value as StateValue);
  }
  function elementsFor(owner: ScreenData): ElementData[] {
    function variants(elements: ElementData[]): ElementData[] {
      return elements.map((element) => {
        const component = design?.components.find(({ id }) => id === element.componentId);
        const binding = element.stateBinding?.variant ?? component?.root?.stateBinding?.variant;
        const value = binding && component ? String(stateValue(element, owner, binding.stateId)) : undefined;
        const selected = binding && value !== undefined && Object.hasOwn(binding.values, value) ? binding.values[value] : undefined;
        return { ...element, ...(selected !== undefined ? { variantId: selected || undefined } : {}), ...(element.children ? { children: variants(element.children) } : {}) };
      });
    }
    function styles(elements: ElementData[]): ElementData[] {
      return elements.map((element) => {
        const binding = element.stateBinding?.style;
        const forced = editing && forcedState?.id === element.id && forcedState.state === 'condition';
        const active = binding && (forced || (binding.operator === 'eq' ? stateValue(element, owner, binding.stateId) === binding.value : stateValue(element, owner, binding.stateId) !== binding.value));
        const next = binding && active ? applyConditionalStyle(resolveElement(element, design ?? undefined), binding.values, breakpoints, viewportWidth) : element;
        return next.children ? { ...next, children: styles(next.children) } : next;
      });
    }
    return styles(materializeElements(variants(owner.elements), design));
  }
  const previewStateKey = JSON.stringify(statePreview);
  useEffect(() => {
    if (!statePreview) return;
    for (const owner of screens) for (const slot of screenStateSlots(owner, design)) {
      if (slot.definition.expression) continue;
      const value = statePreview.values[slot.key];
      if (validStateValue(slot.definition, value)) stateStore.update(slot.key, () => value);
    }
  }, [previewStateKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // 商品取得のプレビュー条件（長文・画像なし）は、模擬APIに渡す商品で再現する（カート・見積も同じ商品名になる）
  const catalogKind = orderScenario?.catalog;
  // 商品は、ダミーデータの「商品」のデータ一覧から読む（Issue #155）。古い案件・注文の API の商品（products）があればそれを使う
  const fromData = useMemo(() => productsFromDatasets(datasets), [datasets]);
  const catalogProducts = products.length ? products : fromData.products;
  const catalogFields = products.length ? productFields : fromData.fields;
  const previewProducts = useMemo(() => productsFor(catalogProducts, catalogFields, catalogKind), [catalogProducts, catalogFields, catalogKind]);
  const orderEnabled = useMemo(() =>
    screens.some(({ elements }) => hasOrderElements(materializeElements(elements, design)))
    || Boolean(screen && hasOrderElements(elementsFor(screen))), [screens, screen, design]);
  const order = useOrder(previewProducts, api, orderScenario, orderEnabled);
  const drag = useRef<{ id: string; x: number; y: number; target: DropTarget | null; moving: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const screenRoot = useRef<HTMLDivElement>(null);
  const actionAbort = useRef<AbortController | null>(null);
  const actionPending = useRef(new WeakSet<HTMLElement>());
  const navigationStack = useRef<Array<{ id: string; records: Records }>>([]);
  // 通知（#166・Issue #241）：重ねて3件まで。種類（情報・成功・失敗）、消えるまでの時間、自作の通知の部品
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const toastSequence = useRef(0);
  useEffect(() => {
    const controller = new AbortController(); actionAbort.current = controller;
    return () => controller.abort();
  }, [screen?.id, editing]);
  useEffect(() => { if (editing) { setToasts([]); navigationStack.current = []; } }, [editing]);
  const dismissToast = (id: number) => setToasts((current) => current.filter((entry) => entry.id !== id));
  // スクロールのスナップ（Issue #185）：スクロールする側（html）に付ける。編集中は付けない
  const snapType = (!editing || snapWhileEditing) && (screen?.snap?.type === 'proximity' || screen?.snap?.type === 'mandatory') ? screen.snap.type : null;
  const snapPadding = typeof screen?.snap?.offset === 'number' && screen.snap.offset > 0 ? screen.snap.offset : 0;
  useEffect(() => {
    const html = screenRoot.current?.ownerDocument.documentElement;
    if (!html || !snapType) return undefined;
    html.style.scrollSnapType = `y ${snapType}`;
    if (snapPadding) html.style.scrollPaddingTop = `${snapPadding}px`;
    return () => { html.style.removeProperty('scroll-snap-type'); html.style.removeProperty('scroll-padding-top'); };
  }, [snapType, snapPadding]);
  // スクロールで隠す（Issue #248）：下へ読み進めると隠れ、上へ戻すと出る。上の端・中にフォーカスがあるときは出す。動きを減らす設定では、すぐに切り替える（CSS）
  const scrollHideKey = screen ? JSON.stringify(collectScrollHide(screen.elements)) : '[]';
  useEffect(() => {
    const root = screenRoot.current;
    const ids: string[] = JSON.parse(scrollHideKey);
    if (editing || !root || !ids.length) return undefined;
    const document = root.ownerDocument;
    const view = document.defaultView;
    if (!view) return undefined;
    const nodes = ids.map((id) => root.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(id)}"]`)).filter((node): node is HTMLElement => Boolean(node));
    for (const node of nodes) node.dataset.scrollHide = view.getComputedStyle(node).top === 'auto' && view.getComputedStyle(node).bottom !== 'auto' ? 'down' : 'up';
    let last = view.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = view.scrollY;
      if (Math.abs(y - last) < 6) return;
      const down = y > last;
      last = y;
      for (const node of nodes) {
        const hide = down && y > node.offsetHeight && !node.contains(document.activeElement);
        if (hide) node.dataset.scrollHidden = ''; else delete node.dataset.scrollHidden;
      }
    };
    const queue = () => { if (!frame) frame = view.requestAnimationFrame(update); };
    const show = (event: Event) => { const node = (event.currentTarget as HTMLElement); delete node.dataset.scrollHidden; };
    view.addEventListener('scroll', queue, { passive: true });
    for (const node of nodes) node.addEventListener('focusin', show);
    return () => {
      view.removeEventListener('scroll', queue);
      if (frame) view.cancelAnimationFrame(frame);
      for (const node of nodes) { node.removeEventListener('focusin', show); delete node.dataset.scrollHidden; delete node.dataset.scrollHide; }
    };
  }, [editing, scrollHideKey]);
  // 目次・セクションのドット（Issue #238）：「今見ている位置を示す」スクロールの操作の対象のうち、いま読んでいるものを求める。
  // 読む位置の線（画面の上から 30%。固定ヘッダーの高さ＝スナップの offset を足す）を越えた最後の対象。ページの終わりでは最後の対象
  const trackedKey = (() => {
    const ids = new Set<string>();
    (function visit(list: ElementData[]) {
      for (const item of list) {
        for (const interaction of validInteractions(item.interactions) ? item.interactions ?? [] : []) {
          for (const action of interaction.actions) if (action.type === 'scroll' && action.current) ids.add(action.targetId);
        }
        if (item.children) visit(item.children);
      }
    })(screen ? screen.elements : []);
    return [...ids].join('\n');
  })();
  const [currentTarget, setCurrentTarget] = useState<string | null>(null);
  useEffect(() => {
    const root = screenRoot.current;
    const targets = trackedKey ? trackedKey.split('\n') : [];
    if (editing || !root || !targets.length) { setCurrentTarget(null); return undefined; }
    const document = root.ownerDocument;
    const view = document.defaultView;
    if (!view) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const nodes = targets.map((id) => [id, root.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(id)}"]`)] as const)
        .filter((entry): entry is readonly [string, HTMLElement] => Boolean(entry[1]?.getClientRects().length))
        .sort((a, b) => a[1].getBoundingClientRect().top - b[1].getBoundingClientRect().top);
      if (!nodes.length) { setCurrentTarget(null); return; }
      const line = snapPadding + view.innerHeight * 0.3;
      let found = nodes[0][0];
      for (const [id, node] of nodes) if (node.getBoundingClientRect().top <= line) found = id;
      const atEnd = document.documentElement.scrollHeight - view.innerHeight - view.scrollY < 2;
      const last = nodes[nodes.length - 1];
      if (atEnd && last[1].getBoundingClientRect().top < view.innerHeight) found = last[0];
      setCurrentTarget(found);
    };
    const schedule = () => { if (!frame) frame = view.requestAnimationFrame(update); };
    update();
    view.addEventListener('scroll', schedule, { passive: true });
    view.addEventListener('resize', schedule);
    return () => { view.removeEventListener('scroll', schedule); view.removeEventListener('resize', schedule); if (frame) view.cancelAnimationFrame(frame); };
  }, [editing, trackedKey, snapPadding]);
  // 画面で最初に出てくる画像は、表示に直結しやすいので優先して読み込む（自動のとき）
  const leadImageId = useMemo(() => {
    function find(elements: ElementData[]): string | null {
      for (const element of elements) {
        if (element.type === 'image' && element.src) return element.id;
        const child = element.children && find(element.children);
        if (child) return child;
      }
      return null;
    }
    return screen ? find(elementsFor(screen)) : null;
  }, [screen, design]);
  const focusDestination = useRef<string | null>(null);
  const [recordsSelected, setRecordsSelected] = useState<Records>(() => routeRecords ?? {});
  // URLから開いたときや、戻る・進むのときは、URLのレコードを選ぶ
  const routeKey = JSON.stringify(routeRecords ?? {});
  useEffect(() => {
    if (routeRecords) setRecordsSelected((current) => ({ ...current, ...routeRecords }));
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dataPages, setDataPages] = useState<Record<string, number>>({});
  const [cartPanel, setCartPanel] = useState<CartPanel | null>(null);
  const [directClosed, setDirectClosed] = useState<string | null>(null);
  const directOverlay = screen?.overlay && (fixedOverlay || !editing && directClosed !== screen.id) ? screen : null;
  const livePanel = directOverlay ? { sourceId: directOverlay.id, element: { id: 'overlay-preview', type: 'button', targetScreenId: directOverlay.id } } : cartPanel?.sourceId === screen?.id ? cartPanel : null;
  const panelScreen = screens.find(({ id }) => id === livePanel?.element.targetScreenId);
  // 入れ子の重ねる画面（Issue #249）：いちばん下の重ねる画面が開いているあいだだけ。消された画面は除く
  const [nested, setNested] = useState<NestedOverlay[]>([]);
  const nestedState = useRef(nested);
  nestedState.current = nested;
  const nestedScreens = livePanel ? nested.map((entry) => ({ entry, target: screens.find(({ id }) => id === entry.id) })).filter((item): item is { entry: NestedOverlay; target: ScreenData } => Boolean(item.target?.overlay)) : [];
  const nestedRefs = useRef(new Map<string, { current: (() => Promise<void>) | null }>());
  const nestedRef = (id: string) => {
    let ref = nestedRefs.current.get(id);
    if (!ref) { ref = { current: null }; nestedRefs.current.set(id, ref); }
    return ref as MutableRefObject<(() => Promise<void>) | null>;
  };
  const ignoreNestedPop = useRef(false);
  /** 積んだ画面の index から上を閉じる（下の画面とフォーカスは OverlayPanel が戻す）。履歴に積んでいれば、その分を戻す */
  function closeNested(index: number) {
    const removed = nestedState.current.slice(index);
    setNested((current) => current.slice(0, index));
    const depth = history.state?.rmNested;
    if (removed.some(({ history: kept }) => kept) && typeof depth === 'number' && depth > index) { ignoreNestedPop.current = true; history.go(-(depth - index)); }
  }
  const panelActionAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); panelActionAbort.current = controller;
    return () => controller.abort();
  }, [panelScreen?.id, editing]);
  const layoutParents = useMemo(() => {
    const parents = new Map<string, ElementData>();
    for (const owner of [screen, panelScreen, ...nestedScreens.map(({ target }) => target)]) {
      if (!owner) continue;
      (function visit(list: ElementData[], parent?: ElementData) {
        for (const item of list) {
          if (parent) parents.set(`${owner!.id}:${item.id}`, parent);
          if (item.children) visit(item.children, item);
        }
      })(elementsFor(owner));
    }
    return parents;
  }, [screen, panelScreen, design, stateStore.values, datasetsById, viewportWidth, forcedState, editing]);
  const commonBackground = resolveBackground(background, design?.tokens);
  const screenBackground = resolveBackground(screen?.background, design?.tokens) ?? commonBackground;
  const panelBackground = resolveBackground(panelScreen?.background, design?.tokens) ?? commonBackground;
  const feedback = useRef(new Map<Element, Animation>());
  const panelRef = useRef<(() => Promise<void>) | null>(null);
  const lastTrial = useRef<PanelTrial | null>(null);

  function notify(text: string, options: boolean | ToastOptions = false) {
    const settings: ToastOptions = typeof options === 'boolean' ? { tone: options ? 'error' : 'info' } : options;
    const tone = settings.tone ?? 'info';
    const component = settings.componentId ? design?.components.find(({ id }) => id === settings.componentId) : undefined;
    const duration = typeof settings.duration === 'number' ? settings.duration : tone === 'error' ? 8000 : 5000;
    toastSequence.current += 1;
    const entry: ToastEntry = { id: toastSequence.current, text, tone, duration, ...(component ? { componentId: component.id } : {}) };
    setToasts((current) => [...current, entry].slice(-3));
  }
  function execute(element: ElementData, source: HTMLElement, trigger: Interaction['trigger'], ownerId: string, key?: string) {
    if (editing || !validInteractions(element.interactions)) return false;
    const matched = element.interactions.filter((entry) => entry.trigger === trigger && (trigger !== 'key' || entry.key === key));
    if (!matched.length || actionPending.current.has(source)) return false;
    actionPending.current.add(source);
    void performActions(matched.flatMap(({ actions }) => actions), {
      source, screenId: ownerId, elementId: element.id, handlers: siteActionHandlers, notify,
      dismissToast: (from) => { const id = Number(from.closest('[data-rm-toast]')?.getAttribute('data-rm-toast')); if (id) dismissToast(id); },
      signal: (ownerId !== screen?.id && livePanel ? panelActionAbort : actionAbort).current?.signal,
      navigate: (id) => { if (screens.some((entry) => entry.id === id)) navigate(id, undefined, element.transition); else throw new Error('移動先の画面が見つかりません。'); },
      openOverlay: (id) => {
        const target = screens.find((entry) => entry.id === id);
        if (!target?.overlay || !screen) throw new Error('重ねて出す画面が見つかりません。');
        // 重ねる画面の中から開いたときは、上に積む（Issue #249）。同じ画面がすでに開いていれば、積まない
        if (livePanel && ownerId !== screen.id) {
          if (target.id === panelScreen?.id || nestedState.current.some((entry) => entry.id === target.id)) return;
          const keep = Boolean(panelHistory && !editing && target.overlay.history);
          if (keep) history.pushState({ ...history.state, rmNested: nestedState.current.length + 1 }, '', location.href);
          setNested((current) => [...current, { id: target.id, anchor: source, history: keep, sequence: Date.now() }]);
          return;
        }
        setCartPanel({ sourceId: screen.id, element: { id: element.id, type: 'button', targetScreenId: id, panelHistory: target.overlay.history }, anchor: source });
      },
      closeOverlay: () => {
        // 積んだ画面の中からなら、その画面（と上）を閉じる
        const index = nestedState.current.findIndex((entry) => entry.id === ownerId);
        if (index >= 0) return nestedRefs.current.get(ownerId)?.current?.();
        return panelRef.current?.();
      },
      updateState: (action) => {
        const owner = screens.find(({ id }) => id === ownerId) ?? screen;
        if (!owner) throw new Error('状態を持つ画面が見つかりません。');
        const slot = stateSlots(element, owner, design).find(({ definition }) => definition.id === action.stateId);
        if (!slot) throw new Error('更新する状態が見つかりません。');
        if (trigger === 'click' || trigger === 'key') source.focus({ preventScroll: true });
        stateStore.update(slot.key, (value) => nextStateValue(action, slot.definition, validStateValue(slot.definition, value) ? value : slot.definition.initial));
      },
      back: () => {
        // 戻るは最前面だけを閉じる（Issue #249）
        const top = nestedState.current.at(-1);
        if (top) { void nestedRefs.current.get(top.id)?.current?.(); return; }
        if (livePanel && !directOverlay) { void panelRef.current?.(); return; }
        if (!onSelect) { source.ownerDocument.defaultView?.history.back(); return; }
        const previous = navigationStack.current.pop();
        if (previous) onNavigate(previous.id, previous.records); else throw new Error('戻る画面がありません。');
      },
    }).finally(() => actionPending.current.delete(source));
    return true;
  }
  const executeRef = useRef(execute);
  useLayoutEffect(() => { executeRef.current = execute; });
  const visibleActionsKey = JSON.stringify([screen, panelScreen, ...nestedScreens.map(({ target }) => target)].flatMap((owner) => {
    const list: Array<[string, ElementData]> = [];
    (function visit(elements: ElementData[]) {
      for (const item of elements) { if (item.interactions?.some(({ trigger }) => trigger === 'visible')) list.push([owner!.id, item]); if (item.children) visit(item.children); }
    })(owner ? elementsFor(owner) : []);
    return list;
  }));
  useEffect(() => {
    const root = screenRoot.current;
    if (editing || !root) return;
    const entries = JSON.parse(visibleActionsKey) as Array<[string, ElementData]>;
    const descriptors = new Map<HTMLElement, [string, ElementData]>();
    for (const [owner, element] of entries) {
      const scope = owner === screen?.id ? root : root.querySelector<HTMLElement>(`[data-screen-id="${CSS.escape(owner)}"]`);
      const node = scope?.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(element.id)}"]`);
      if (node) descriptors.set(node, [owner, element]);
    }
    const observer = new IntersectionObserver((items) => {
      for (const item of items) {
        if (!item.isIntersecting) continue;
        const node = item.target as HTMLElement;
        const descriptor = descriptors.get(node);
        if (descriptor) executeRef.current(descriptor[1], node, 'visible', descriptor[0]);
        observer.unobserve(node);
      }
    });
    for (const node of descriptors.keys()) observer.observe(node);
    return () => observer.disconnect();
  }, [editing, visibleActionsKey]);

  // 遷移先へ、選んでいるレコードも渡す（書き出したサイトでは、詳細画面のURLに含める。Issue #108）
  /** 詳細で画像をつなげるか：同じデータの一覧のどれかで「詳細へ画像をつなげる」を選んでいる（Issue #120） */
  function sharesImages(datasetId: string | undefined) {
    const has = (elements: ElementData[] | undefined): boolean => (elements ?? []).some((item) => (item.type === 'data-list' && item.sharedImage && item.binding?.datasetId === datasetId) || has(item.children));
    return screens.some(({ elements }) => has(elements));
  }

  /**
   * transition（Issue #120）：fade（既定）・slide・shared（共有要素だけを動かす）・none。
   * View Transitions の種類は html[data-rm-transition] で CSS を切り替える（:active-view-transition-type より対応環境が広い）
   */
  function navigate(target: string | null | undefined, records?: Records, transition?: string) {
    if (!target || target === screen?.id) return;
    const selection = { ...recordsSelected, ...records };
    if (screen) navigationStack.current.push({ id: screen.id, records: recordsSelected });
    order.clearError();
    setCartPanel(null);
    setNested([]);
    focusDestination.current = target;
    // 画面の切り替えは View Transitions で。非対応の環境と、動きを減らす設定では即時に切り替える（Issue #125）
    const view = screenRoot.current?.ownerDocument;
    const reduced = prefersReducedMotion(view);
    const go = () => {
      if (!editing && view?.startViewTransition && !reduced && transition !== 'none') {
        const html = view.documentElement;
        html.dataset.rmTransition = transition || 'fade';
        const running = view.startViewTransition(() => flushSync(() => onNavigate(target, selection)));
        // 次の切り替えが始まると、前の切り替えは飛ばされて AbortError で終わる。ふつうのことなので、拾って捨てる（Issue #270）
        running.ready.catch(() => {});
        void running.finished.catch(() => {}).finally(() => { if (html.dataset.rmTransition === (transition || 'fade')) delete html.dataset.rmTransition; });
      } else onNavigate(target, selection);
    };
    // 画面から出るときの動きがあれば、終わってから切り替える（Issue #133）
    if (!editing && screen) void playExit(screenRoot.current, elementsFor(screen), design?.tokens).then(go);
    else go();
  }

  // パネルの開閉をブラウザの履歴に含める（Issue #130）。書き出したサイトだけ（panelHistory）。「戻る」でパネルだけを閉じる
  const panelEntry = useRef(false);
  useEffect(() => {
    if (!panelHistory || editing || !livePanel?.element.panelHistory || panelEntry.current) return;
    const url = new URL(location.href);
    if (panelScreen?.overlay) url.searchParams.set('overlay', panelScreen.id);
    history.pushState({ ...history.state, rmPanel: panelScreen?.id }, '', url);
    panelEntry.current = true;
  }, [panelHistory, editing, livePanel]);
  useEffect(() => {
    if (!panelHistory) return undefined;
    function onPopState() {
      // 積んだ重ねる画面（Issue #249）：戻るは最前面だけを閉じる
      if (ignoreNestedPop.current) { ignoreNestedPop.current = false; return; }
      const depth = typeof history.state?.rmNested === 'number' ? history.state.rmNested : 0;
      if (nestedState.current.length > depth) {
        const keep = nestedState.current.slice(0, depth);
        setNested(keep);
        return;
      }
      const id = new URL(location.href).searchParams.get('overlay');
      const target = screens.find((entry) => entry.id === id && entry.overlay?.history);
      if (target && screen) {
        panelEntry.current = true;
        setCartPanel({ sourceId: screen.id, element: { id: 'overlay-url', type: 'button', targetScreenId: target.id, panelHistory: true } });
        return;
      }
      panelEntry.current = false;
      order.clearError();
      setCartPanel(null);
    }
    addEventListener('popstate', onPopState);
    onPopState();
    return () => removeEventListener('popstate', onPopState);
  }, [panelHistory, screen?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 状態の変化を、要素の動きに知らせる（Issue #133） */
  function notifyState(kind: string) {
    screenRoot.current?.dispatchEvent(new CustomEvent('rm:state', { detail: { kind } }));
  }
  // データの読み込みが終わった・エラーになったときに知らせる（プレビュー条件の切り替えも含む）
  const dataStates = JSON.stringify(Object.fromEntries((datasets ?? []).map(({ id }) => [id, scenarios?.[id]?.kind ?? 'normal'])));
  const previousStates = useRef(dataStates);
  useEffect(() => {
    const before: Record<string, string> = JSON.parse(previousStates.current);
    const after: Record<string, string> = JSON.parse(dataStates);
    previousStates.current = dataStates;
    if (Object.entries(after).some(([id, kind]) => before[id] === 'loading' && kind !== 'loading' && kind !== 'error')) notifyState('loaded');
    if (Object.entries(after).some(([id, kind]) => before[id] !== 'error' && kind === 'error')) notifyState('error');
  }, [dataStates]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeCart() {
    order.clearError();
    setCartPanel(null);
    setNested([]);
    if (directOverlay) setDirectClosed(directOverlay.id);
    // 閉じるボタンで閉じたときは、積んだ履歴を戻す
    if (panelEntry.current) {
      panelEntry.current = false;
      if (history.state?.rmPanel) history.back();
      else { const url = new URL(location.href); url.searchParams.delete('overlay'); history.replaceState(history.state, '', url); }
    }
  }

  function playFeedback(id?: string, trialSettings?: Partial<PanelMotion>) {
    for (const node of screenRoot.current?.querySelectorAll<HTMLElement>('[data-cart-feedback]') ?? []) {
      const elementId = node.dataset.cartFeedback;
      if (id && elementId !== id) continue;
      const settings: PanelMotion = { ...feedbackDefaults, ...(trialSettings ?? JSON.parse(node.dataset.feedbackSettings ?? '{}')) };
      feedback.current.get(node)?.cancel();
      const animation = animateElement(node, feedbackFrames(settings), animationOptions(settings));
      if (!animation) continue;
      feedback.current.set(node, animation);
      void animation.finished.then(() => {
        if (feedback.current.get(node) === animation) feedback.current.delete(node);
        animation.cancel();
      }, () => {});
    }
  }

  useEffect(() => {
    if (!editing || !trial || trial === lastTrial.current) return;
    lastTrial.current = trial;
    if (trial.screenId !== screen?.id) return;
    if (trial.kind === 'feedback') playFeedback(trial.element.id, trial.element.motion?.feedback);
    else if (screen) setCartPanel({ sourceId: screen.id, element: trial.element, trialClose: trial.kind === 'close', sequence: trial.sequence });
  }, [editing, screen?.id, trial]);

  useEffect(() => {
    const animations = feedback.current;
    return () => {
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
    };
  }, [screen?.id]);

  useEffect(() => {
    const viewport = screenRoot.current?.ownerDocument.defaultView;
    if (!viewport) return undefined;
    const update = () => setViewportWidth(viewport.innerWidth);
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);

  useLayoutEffect(() => {
    const root = screenRoot.current;
    const view = root?.ownerDocument.defaultView as (Window & { ResizeObserver: typeof ResizeObserver }) | null | undefined;
    if (!root || !view) return undefined;
    const bars = [...root.querySelectorAll<HTMLElement>('.cart-bar')];
    if (!bars.length) return undefined;
    const update = () => {
      const height = Math.max(...bars.map((bar) => bar.offsetHeight));
      root.style.setProperty('--cart-bar-clearance', `${height + 8}px`);
    };
    const observer = new view.ResizeObserver(update);
    bars.forEach((bar) => observer.observe(bar));
    update();
    return () => {
      observer.disconnect();
      root.style.removeProperty('--cart-bar-clearance');
    };
  }, [screen, design, screens, editing]);

  function revealFocus({ target, currentTarget }: FocusEvent<HTMLDivElement>) {
    if (editing || target === currentTarget || target.closest('.cart-bar, .cart-dialog')) return;
    const bounds = target.getBoundingClientRect();
    const covered = [...currentTarget.querySelectorAll('.cart-bar')].some((bar) => {
      const { top, bottom, left, right } = bar.getBoundingClientRect();
      return bounds.bottom + 4 > top && bounds.top < bottom && bounds.right > left && bounds.left < right;
    });
    if (covered) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // 要素の動き（Issue #102）。操作モードと書き出したサイトで、きっかけに合わせて再生する
  useEffect(() => attachMotions(screenRoot.current, screen ? elementsFor(screen) : [], { editing, tokens: design?.tokens }),
    [screen, design, editing, reducedMotion]);
  // 設定パネルからの試し再生（編集モードでも再生する）
  useEffect(() => {
    if (!motionTrial || !screenRoot.current) return;
    // タイムラインの試し再生（Issue #208）：開いたときの動きを、並べた順で
    if ('timeline' in motionTrial) { if (screen) playTimeline(screenRoot.current, elementsFor(screen), design?.tokens); return; }
    const node = screenRoot.current.querySelector(`[data-element-id="${CSS.escape(motionTrial.elementId)}"]`);
    playOnce(node, motionTrial.animation, prefersReducedMotion(screenRoot.current.ownerDocument), design?.tokens);
  }, [motionTrial]);

  useEffect(() => {
    if (!editing && screen?.id && focusDestination.current === screen.id) {
      focusDestination.current = null;
      screenRoot.current?.focus();
    }
  }, [editing, screen?.id]);

  function dragHandlers(element: ElementData): HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | undefined> {
    if (!editing || !onRelocate || element.partId || element.id === textEditId || element.locked) return {};
    return {
      'data-editor-container': element.children && !element.componentId && !(element.customComponentId && customComponents[element.customComponentId]?.childless) ? '' : undefined,
      'data-drop': dropTarget?.id === element.id ? dropTarget.placement : undefined,
      onDragStart: (event) => event.preventDefault(),
      onPointerDown: (event) => {
        // マウスとペンで移動できる。タッチはスクロールに使うため、レイヤーツリーの取っ手で移動する（Issue #80）
        if (event.button !== 0 || event.pointerType === 'touch') return;
        if ((event.target as Element).closest('[data-editor-element]') !== event.currentTarget) return;
        suppressClick.current = false;
        drag.current = { id: element.id, x: event.clientX, y: event.clientY, target: null, moving: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event) => {
        const state = drag.current;
        if (state?.id !== element.id) return;
        if (!state.moving && Math.hypot(event.clientX - state.x, event.clientY - state.y) < 6) return;
        state.moving = true;
        const document = event.currentTarget.ownerDocument;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-editor-element]');
        let next: DropTarget | null = null;
        const view = document.defaultView;
        if (view && target?.parentElement && target.dataset.editorElement && target.hasAttribute('data-editor-movable') && target.dataset.editorElement !== state.id) {
          const bounds = target.getBoundingClientRect();
          const style = view.getComputedStyle(target.parentElement);
          const horizontal = style.display === 'flex' && style.flexDirection === 'row';
          const ratio = horizontal ? (event.clientX - bounds.left) / bounds.width : (event.clientY - bounds.top) / bounds.height;
          const inside = target.hasAttribute('data-editor-container') && ratio > 0.25 && ratio < 0.75;
          next = { id: target.dataset.editorElement, placement: inside ? 'inside' : ratio < 0.5 ? 'before' : 'after' };
        }
        if (state.target?.id === next?.id && state.target?.placement === next?.placement) return;
        state.target = next;
        setDropTarget(next);
      },
      'data-editor-movable': '',
      onPointerUp: (event) => {
        const state = drag.current;
        if (state?.id !== element.id) return;
        drag.current = null;
        setDropTarget(null);
        suppressClick.current = state.moving;
        if (state.target) onRelocate(state.id, state.target.id, state.target.placement);
        event.stopPropagation();
      },
      onPointerCancel: () => {
        drag.current = null;
        setDropTarget(null);
      },
    };
  }

  /** 共通部品の配置を、生成したコンポーネントで描く。props で表せなければ null */
  function renderShared(instance: ElementData, materialized: ElementData, inPanel: PanelOwner) {
    const entry = instance.componentId ? sharedComponents?.[instance.componentId] : undefined;
    if (!entry || editing) return null;
    if (Object.entries(instance).some(([key, value]) => !instanceKeys.has(key) && !empty(value)) || !empty(instance.style) || !empty(instance.tokenRefs) || instance.action) return null;
    const variant = entry.variants[instance.variantId || 'base'];
    if (!variant) return null;
    const component = design?.components.find(({ id }) => id === instance.componentId);
    const rootId = component?.root?.id ?? component?.id;
    if (!rootId) return null;
    const values: Record<string, Partial<ElementData> | undefined> = { ...instance.childOverrides, [rootId]: { text: instance.text, src: instance.src, alt: instance.alt, targetScreenId: instance.targetScreenId } };
    const props: Record<string, unknown> = { variant, elementId: instance.id };
    for (const [partId, patch] of Object.entries(values)) {
      if (!patch) continue;
      const names = entry.parts[partId];
      if (!names || Object.entries(patch).some(([key, value]) => !partKeys.has(key) && value != null) || patch.action) return null;
      if (names.text && typeof patch.text === 'string') props[names.text] = patch.text;
      if (names.src && typeof patch.src === 'string') props[names.src] = resolveAssetSrc(patch.src, assetUrls) ?? '';
      if (names.alt && typeof patch.alt === 'string') props[names.alt] = patch.alt;
      const target = patch.targetScreenId;
      if (names.press && target) props[names.press] = () => navigate(target);
    }
    const extra = instance.children?.length ? (materialized.children ?? []).slice(-instance.children.length) : [];
    const { Component } = entry;
    return <Component key={instance.id} {...props}>{extra.length ? extra.map((child) => renderElement(child, inPanel)) : undefined}</Component>;
  }

  /**
   * 文字の中身（Issue #120）。分けて動かす文字は1つずつの span（読み上げない）と、全文（見えない）にする。
   * 数え上げる文字は、動きの仕組みが書き換える span（React は中身を持たない）と、全文（見えない）にする。編集中はそのまま
   */
  function textContent(element: ElementData, allowLinks = true) {
    const text = typeof element.text === 'string' ? element.text : '';
    const split = !editing && element.animations?.find(({ split: mode }) => mode)?.split;
    if (!editing && element.countUp && /\d/.test(text)) {
      return <><span className="visually-hidden">{text}</span><span aria-hidden="true" data-count-text={text}
        dangerouslySetInnerHTML={{ __html: text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`) }} /></>;
    }
    if (!split && isStructured(element)) return richContent(element, allowLinks);
    if (!split || !text) return element.text;
    return <><span className="visually-hidden">{text}</span><span aria-hidden="true">{splitText(text, split).map((piece, index) =>
      <span key={index} data-split-piece="" className={split === 'line' ? 'rm-split-line' : 'rm-split-piece'}>{piece}</span>)}</span></>;
  }

  /**
   * 装飾つきの文章・段落・箇条書き（Issue #150）。太字は strong、斜体は em、取り消し線は s、リンクは a。
   * 画面へのリンクは、サイトの遷移で切り替える。要素全体がリンクのときは、中のリンクを付けない（a の入れ子を避ける）
   */
  function richContent(element: ElementData, allowLinks = true) {
    const routes = siteRoutes({ screens, startScreenId: startScreenId ?? screens[0]?.id }, basePath ?? import.meta.env.BASE_URL);
    const inline = (spans: RichSpan[]) => spans.map((span, index) => {
      let node: ReactNode = span.text.split('\n').map((part, line) => <React.Fragment key={line}>{line ? <br /> : null}{part}</React.Fragment>);
      if (span.underline || span.color) node = <span style={{ textDecorationLine: span.underline ? 'underline' : undefined, color: span.color }}>{node}</span>;
      if (span.strike) node = <s>{node}</s>;
      if (span.italic) node = <em>{node}</em>;
      if (span.bold) node = <strong>{node}</strong>;
      const screenId = span.link?.screenId && screens.some(({ id }) => id === span.link?.screenId) ? span.link.screenId : null;
      const url = screenId ? routes.pathOf(screenId) : safeUrl(span.link?.url);
      if (span.link && (allowLinks || editing)) {
        const newTab = !screenId && span.link.newTab;
        node = <a href={url ?? (editing ? '#rm-link' : undefined)} data-screen-id={screenId ?? undefined} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined}
          onClick={(event) => {
            if (editing) { event.preventDefault(); return; }
            if (!screenId || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); event.stopPropagation(); navigate(screenId);
          }}>{node}</a>;
      }
      return <React.Fragment key={index}>{node}</React.Fragment>;
    });
    const blocks = elementBlocks(element);
    const inner = blockTag(element);
    if (!inner) return inline(blocks[0]?.spans ?? []);
    const Inner = inner as 'p' | 'li';
    return blocks.map((block, index) => <Inner key={index}>{inline(block.spans)}</Inner>);
  }

  /** 画面の中身。書き出したサイトで、画面のファイルが今の内容と合えばそれを使う。要素は element(id) で描く */
  function renderScreen(screen: ScreenData) {
    const materialized = elementsFor(screen);
    const generated = !editing && generatedScreens?.[screen.id];
    // コードで管理する画面（Issue #89）は、署名に関係なくファイルで描く
    if (!generated || (!screen.codeManaged && generated.signature !== screenSignature(screen, breakpoints))) return materialized.map((element) => renderElement(element));
    const byId = new Map<string, ElementData>();
    (function index(list: ElementData[]) { for (const item of list) { byId.set(item.id, item); if (item.children) index(item.children); } })(materialized);
    const { Component } = generated;
    return <Component element={(id) => { const item = byId.get(id); return item ? renderElement(item) : null; }} />;
  }

  function renderStateErrors(owner: ScreenData) {
    const errors = screenStateSlots(owner, design).flatMap(({ definition, key, label }) => {
      const error = resultsFor(owner).get(key)?.error;
      return error ? [`「${label}：${definition.name}」を計算できないため、代わりの値を表示しています。${error}`] : [];
    });
    return errors.length ? <div role="status" className="rm-state-errors">{errors.map((error, index) => <p key={index}>{error}</p>)}</div> : null;
  }

  function renderElement(rawElement: ElementData, inPanel: PanelOwner = false, row?: DataRow & { rootId?: string }, content?: Parameters<ComboboxRenderer>[1], partState?: Parameters<ComboboxRenderer>[2]): ReactNode {
    const owner = inPanel === true ? panelScreen : inPanel || screen;
    if (!owner) return null;
    // 繰り返し（Issue #160）：データの行の数だけ並べる。編集中は2件目からを触れない写しにする。0件なら決めた文言
    if (rawElement.repeat?.datasetId) {
      const dataset = datasets?.find(({ id }) => id === rawElement.repeat?.datasetId);
      const records = repeatRecords(rawElement.repeat, dataset, dataset ? scenarios?.[dataset.id] : undefined);
      const single: ElementData = { ...rawElement, repeat: undefined };
      if (!dataset || !records.length) {
        if (editing) return renderElement(single, inPanel, row);
        return <p key={rawElement.id} className="rm-repeat-empty" data-element-id={rawElement.id}>{rawElement.repeat.emptyText?.trim() || 'まだありません。'}</p>;
      }
      return <React.Fragment key={rawElement.id}>{records.map((record, index) => <React.Fragment key={record.id}>
        {renderElement(single, inPanel, { dataset, record, index, rootId: rawElement.id, parts: rawElement.dataBind?.parts })}</React.Fragment>)}</React.Fragment>;
    }
    // 値の流し込み（Issue #160・#53）：行の項目（繰り返しの外では、選んだ1件）を、文言・画像・リンクに入れる
    const bound = bindElement(rawElement, row, datasets, scenarios, recordsSelected);
    if (bound.hidden && !editing) return null;
    rawElement = bound.element;
    if (rawElement.componentId && rawElement.dataBind?.parts && !row?.parts) {
      const picked = row ?? (rawElement.dataBind.datasetId ? pickRecord(rawElement.dataBind, datasets, scenarios, recordsSelected) : undefined);
      if (picked) row = { ...picked, parts: rawElement.dataBind.parts };
    }
    const copy = editing && row && row.index > 0 && rawElement.id === row.rootId;
    const editable = editing && (!inPanel || fixedOverlay && directOverlay?.id === owner.id);
    const condition = rawElement.stateBinding?.visible;
    const visible = !condition || (condition.operator === 'eq' ? stateValue(rawElement, owner, condition.stateId) === condition.value : stateValue(rawElement, owner, condition.stateId) !== condition.value);
    const text = rawElement.stateBinding?.text;
    if (text) rawElement = { ...rawElement, richText: undefined, text: `${text.prefix ?? ''}${stateValue(rawElement, owner, text.stateId)}${text.suffix ?? ''}` };
    const hasInteractions = (node: ElementData): boolean => Boolean(node.interactions?.length || node.stateBinding || node.dataBind || node.repeat || design?.components.find(({ id }) => id === node.componentId)?.variables?.length || node.children?.some(hasInteractions));
    if (!content && sharedComponents && rawElement.componentId && !rawElement.partId && !hasInteractions(rawElement)) {
      const instance = findElement(owner.elements, rawElement.id);
      const shared = instance && renderShared(instance, rawElement, inPanel);
      if (shared) return shared;
    }
    const ownerId = owner.id;
    const classes = elementClasses && Object.hasOwn(elementClasses, ownerId) ? elementClasses[ownerId] : undefined;
    // 書き出しのクラスは、作ったときのスタイルと同じ要素にだけ使う（project.json を直接書き換えた要素は描画時のスタイルで出す。Issue #116）
    const signatures = elementSignatures?.[ownerId];
    const parent = layoutParents.get(`${ownerId}:${rawElement.id}`);
    const fresh = !signatures || !Object.hasOwn(signatures, rawElement.id) || signatures[rawElement.id] === styleSignature(rawElement, parent);
    const styleClass = fresh && classes && Object.hasOwn(classes, rawElement.id) ? classes[rawElement.id] : undefined;
    const element = styleClass ? rawElement : resolveElement(rawElement, design ?? undefined);
    const opensPanel = !inPanel && ['button', 'custom'].includes(element.type) && element.panel && !element.action
      && element.targetScreenId !== screen?.id && screens.some(({ id }) => id === element.targetScreenId);
    // コードで足した属性とクラス（Issue #89）。属性は決まった名前だけ（screen-files.js の codeAttribute と同じ）
    const codeAttributes = Object.fromEntries(Object.entries(element.attributes ?? {}).filter(([key, value]) => codeAttribute.test(key) && typeof value === 'string'));
    const codeClasses = typeof element.classes === 'string' && element.classes.trim() ? ` ${element.classes.trim().split(/\s+/).join(' ')}` : '';
    const interactions = validInteractions(element.interactions) ? element.interactions : [];
    const link = clickLink(interactions);
    const href = link?.type === 'navigate' ? siteRoutes({ screens, startScreenId: startScreenId ?? screens[0]?.id }, basePath ?? import.meta.env.BASE_URL).pathOf(link.screenId) : link && actionHref(link);
    const newTab = link?.type === 'link' && link.newTab;
    const linkProps = href ? { href, target: newTab ? '_blank' : undefined, rel: newTab ? 'noopener noreferrer' : undefined } : {};
    const clickable = interactions.some(({ trigger }) => trigger === 'click');
    const toggler = interactions.filter(({ trigger }) => trigger === 'click').flatMap(({ actions }) => actions).find((action) => action.type === 'toggleState');
    const tracked = interactions.filter(({ trigger }) => trigger === 'click').flatMap(({ actions }) => actions).find((action) => action.type === 'scroll' && action.current);
    const selector = interactions.filter(({ trigger }) => trigger === 'click').flatMap(({ actions }) => actions).find((action) => action.type === 'setState');
    const keyable = clickable || interactions.some(({ trigger }) => trigger === 'key' || trigger === 'focus');
    // 自作・取り込みの部品（custom）は、中のボタンや送信で「押した」を起こす。外側を button にしない（フォームを button で包んでいた。#282）
    const ownActivation = element.type === 'custom';
    const nativeButton = element.type === 'button' || isNativeControl(element.type);
    const nativeLink = Boolean(href && ['button', 'text', 'heading', 'image', 'container', 'icon'].includes(element.type));
    const props: HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | undefined> = {
      ...codeAttributes,
      className: `element element-${element.type}${styleClass ? ` ${styleClass}` : ''}${codeClasses}${element.prose ? ` rm-prose ${proseClass(element.prose)}` : ''}`,
      // 切り替えの自動の動き（Issue #176）：共通部品の配置の根に、時間と曲線の CSS 変数。画面の間でつなげる名前（view-transition-name）
      style: (() => {
        const base = styleClass ? undefined : elementStyle(element, breakpoints, viewportWidth, parent && resolveElement(parent, design ?? undefined));
        const smart = element.componentId && !element.instanceId ? smartStyle(smartMotion(design?.components.find(({ id }) => id === element.componentId))) : undefined;
        const connect = !editing ? connectName(element.viewTransition) : undefined;
        return smart || connect ? { ...base, ...smart, ...(connect ? { viewTransitionName: connect } : {}) } as CSSProperties : base;
      })(),
      'data-rm-smart': element.componentId && !element.instanceId && smartMotion(design?.components.find(({ id }) => id === element.componentId)) ? '' : undefined,
      'data-rm-toggle': element.instanceId && element.stateBinding?.visible ? '' : undefined,
      'data-repeat-copy': copy ? '' : undefined,
      inert: copy || undefined,
      'data-element-id': element.id,
      'data-rm-action': interactions.length ? '' : undefined,
      'data-state-hidden': editing && !visible ? '' : undefined,
      hidden: !editing && !visible,
      role: !editing && clickable && !ownActivation && !nativeButton && !nativeLink ? 'button' : codeAttributes.role,
      // 開閉（aria-expanded を付けた要素）とタブ（role="tab"）は、状態を読み上げに出す（Issue #154）
      'aria-pressed': !editing && toggler?.type === 'toggleState' && !('aria-expanded' in codeAttributes) ? Boolean(stateValue(rawElement, owner, toggler.stateId)) : undefined,
      'aria-expanded': !editing && toggler?.type === 'toggleState' && 'aria-expanded' in codeAttributes ? Boolean(stateValue(rawElement, owner, toggler.stateId)) : codeAttributes['aria-expanded'] as 'true' | 'false' | undefined,
      'aria-selected': !editing && selector && codeAttributes.role === 'tab' ? stateValue(rawElement, owner, selector.stateId) === selector.value : undefined,
      'aria-current': nativeLink && link?.type === 'navigate' ? link.screenId === screen?.id ? 'page' : undefined
        : !editing && tracked?.type === 'scroll' ? (tracked.targetId === currentTarget ? 'location' : undefined)
          : codeAttributes['aria-current'] as HTMLAttributes<HTMLElement>['aria-current'],
      tabIndex: !editing && keyable && !(ownActivation && !interactions.some(({ trigger }) => trigger === 'key' || trigger === 'focus')) && !nativeButton && !nativeLink ? 0 : undefined,
      onMouseEnter: !editing ? (event) => { execute(element, event.currentTarget, 'hover', ownerId); } : undefined,
      onFocus: !editing ? (event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) execute(element, event.currentTarget, 'focus', ownerId); } : undefined,
      onKeyDown: !editing ? (event) => {
        if (event.nativeEvent.isComposing || event.target !== event.currentTarget) return;
        if (interactions.some((entry) => entry.trigger === 'key' && entry.key === event.key)) { event.preventDefault(); event.stopPropagation(); execute(element, event.currentTarget, 'key', ownerId, event.key); }
        else if (clickable && !ownActivation && !nativeButton && !nativeLink && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); execute(element, event.currentTarget, 'click', ownerId); }
      } : undefined,
      'data-editor-element': editing && onRelocate ? element.id : undefined,
      ...dragHandlers(element),
      'data-selected': editing && (element.id === selectedId || selectedIds?.includes(element.id)) ? '' : undefined,
      'data-force-state': forcedState?.id === element.id ? forcedState.state : undefined,
      // 共通部品の配置（とその中の要素）は、ダブルクリックでコンポーネントの作業場に定義を開く（Issue #123）
      onDoubleClick: editable && onOpenComponent && (element.componentId || element.instanceId)
        ? (event) => {
          event.stopPropagation();
          const componentId = element.componentId ?? findElement(screen?.elements, element.instanceId)?.componentId;
          if (componentId) onOpenComponent(componentId);
        }
        : editable && onTextEdit && ['heading', 'text', 'button'].includes(element.type) && typeof element.text === 'string'
          ? (event) => { event.stopPropagation(); onTextEdit(element.id); } : undefined,
      onClick: (event) => {
        if (editing && nativeLink) event.preventDefault();
        if (!editing && clickable && element.type !== 'custom') {
          if ((event.target as Element).closest('[data-rm-action]') !== event.currentTarget) return;
          event.stopPropagation();
          if (nativeLink && (link?.type !== 'navigate' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
          event.preventDefault(); execute(element, event.currentTarget, 'click', ownerId); return;
        }
        if (editable) {
          // ロックした要素は、キャンバスでは選ばない（親が選ばれる。Issue #80）
          if (element.locked) return;
          event.stopPropagation();
          // Shift・⌘/Ctrl で選択に加える・外す（Issue #81）
          if (!suppressClick.current) onSelect?.(element.id, { additive: event.shiftKey || event.metaKey || event.ctrlKey });
          suppressClick.current = false;
        } else if (element.type === 'button' && (!editing || (inPanel && !element.action && element.targetScreenId === screen?.id))) {
          if (inPanel && !element.action && element.targetScreenId === screen?.id) void panelRef.current?.();
          else if (opensPanel && screen) setCartPanel({ sourceId: screen.id, element });
          else if (element.action) void order.run(element.action as OrderAction, () => navigate(element.targetScreenId, undefined, element.transition));
          // 繰り返しの行の中のボタンは、その行を選んで移る（移り先で「一覧で選んだ1件」を出せる。#282）
          else {
            if (row) setRecordsSelected((current) => ({ ...current, [row.dataset.id]: row.record.id }));
            navigate(element.targetScreenId, row ? { [row.dataset.id]: row.record.id } : undefined, element.transition);
          }
        }
      },
    };

    if (content) {
      const state = !editing && partState ? Object.assign({}, ...partState.map((state) => stateStyle(resolveElement(element, design ?? undefined), state, parent, breakpoints, viewportWidth))) : undefined;
      return content({ ...props, style: { ...props.style, ...state } });
    }
    if (element.combobox) {
      const binding = element.stateBinding?.input;
      const slot = binding && stateSlots(rawElement, owner, design).find(({ definition }) => definition.id === binding.stateId && definition.type === 'text' && !definition.expression);
      const controlled = comboboxControls?.[element.id] ?? (slot ? { value: String(stateValue(rawElement, owner, slot.definition.id)), onValueChange: (value: string) => { if (validStateValue(slot.definition, value)) stateStore.update(slot.key, () => value); } } : {});
      return <div key={element.id} {...props}><ComboboxView root={element} datasets={[...datasetsById.values()]} editing={editing} {...controlled}
        render={(part, content, state) => renderElement(part, inPanel, row, content, state)} /></div>;
    }
    if (isNativeControl(element.type)) {
      let ancestor = parent; let scope = element.instanceId ?? owner.id; let labelled = false;
      const seen = new Set<string>();
      while (ancestor && !seen.has(ancestor.id)) {
        seen.add(ancestor.id);
        if (ancestor.type === 'label') labelled = true;
        if (ancestor.type === 'fieldset') { scope = ancestor.id; break; }
        ancestor = layoutParents.get(`${ownerId}:${ancestor.id}`);
      }
      const control = validControl(element.control) ? element.control : {};
      return <ControlView key={`${element.id}:${editing ? JSON.stringify(control) : 'live'}`} {...props} kind={element.type} control={control} scope={scope} labelled={labelled} editing={editing} />;
    }
    if (element.type === 'custom') {
      const id = element.customComponentId ?? '';
      const View = Object.hasOwn(customComponents, id) ? customComponents[id].View as RegisteredView | undefined : undefined;
      const children = (element.children ?? []).map((child) => renderElement(child, inPanel, row));
      const ownerScreenId = owner.id;
      return <div key={element.id} {...props}>
        {View ? <PartBoundary key={JSON.stringify([ownerScreenId, id])} name={customComponents[id].label} View={View}><View
          values={linkedValues(element, owner)} onValueChange={(name, value) => linkValueChange(element, owner, name, value)} datasetsById={datasetsById} assetUrls={assetUrls} preview={componentPreview} statusMessages={element.statusMessages}
          conditions={componentConditions?.[ownerScreenId]?.[element.id]} interactive={!editing} onActivate={() => {
            if (editing) return;
            if (clickable) { const source = screenRoot.current?.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(element.id)}"]`); if (source) execute(element, source, 'click', ownerScreenId); return; }
            if (opensPanel && screen) setCartPanel({ sourceId: screen.id, element });
            else navigate(element.targetScreenId);
          }}>{children}</View></PartBoundary> : <><p>未登録の部品（{id}）</p>{children}</>}
      </div>;
    }
    if (isLayoutElement(element.type)) {
      const Container = nativeLink ? 'a' : element.type === 'label' ? 'label' : element.type === 'fieldset' ? 'fieldset' : 'div';
      const video = element.type === 'container' && validBackgroundVideo(element.backgroundVideo) ? element.backgroundVideo : null;
      const videoProps = video ? { ...props, className: `${props.className} rm-has-video` } : props;
      return <Container key={element.id} {...videoProps} {...linkProps}>{video && <BackgroundVideo settings={video} editing={editing} />}{element.type === 'fieldset' ? <legend>{element.text || 'グループ'}</legend> : element.type === 'label' ? element.text : null}{(element.children ?? []).map((child) => renderElement(child, inPanel, row))}</Container>;
    }
    if (element.type === 'button') {
      const disabled = !editing && (order.pending
        || (order.orderOutcomeUnknown && element.action !== 'submit')
        || (element.action === 'quote' && !order.summary.count)
        || (element.action === 'submit' && (!order.quote || Boolean(order.receipt))));
      if (editing && textEditId === element.id) {
        return <EditableText key={element.id} as="span" props={{ ...props, className: `${props.className} element-text-editing` }}
          text={element.text} onCommit={(text) => onTextCommit?.(element.id, text)} />;
      }
      const ButtonTag = nativeLink ? 'a' : 'button';
      const button = <ButtonTag key={element.id} {...linkProps} type="button" disabled={disabled}
        aria-haspopup={opensPanel ? 'dialog' : undefined}
        data-order-action={inspect ? element.action : undefined}
        data-cart-feedback={element.motion?.feedback ? element.id : undefined}
        data-feedback-settings={element.motion?.feedback ? JSON.stringify(element.motion.feedback) : undefined}
        {...props}>{element.icon && element.iconPosition !== 'end' && <IconSvg node={element.icon.node} size={iconSize(element, 18)} />}
        {element.text}
        {element.icon && element.iconPosition === 'end' && <IconSvg node={element.icon.node} size={iconSize(element, 18)} />}</ButtonTag>;
      // 合計の読み上げは画面に1つ（Issue #253）：同じ画面の商品一覧・カートが合計を知らせるなら、カートの帯は表示だけ
      const announced = !showsOrderTotal(owner.elements);
      return opensPanel ? <div key={element.id} className="cart-bar" data-element-id={element.id}>
        {button}<span role={announced ? 'status' : undefined}>{order.summary.count}点 · {orderRuntime?.yen(order.summary.total)}</span>
      </div> : button;
    }
    if (editing && textEditId === element.id && (element.type === 'text' || element.type === 'heading')) {
      // 文章は段落ごとに <p>（箇条書きは <li>）で編集する。見出しは1段落（Issue #150）
      const list = textTag(element);
      const Tag = element.type === 'heading' ? headingTag(element.level) : list === 'ul' || list === 'ol' ? list : 'div';
      const blocks = elementBlocks(element);
      const Inner = list === 'ul' || list === 'ol' ? 'li' : 'p';
      return <RichTextEditor key={element.id} as={Tag} props={props} multiline={element.type === 'text'}
        onCommit={(text, richText) => onTextCommit?.(element.id, text, richText)}>
        {element.type === 'heading' ? richContent(element) : blocks.map((block, index) => <Inner key={index}>{richContent({ ...element, type: 'heading', richText: [block], text: block.spans.map(({ text }) => text).join('') })}</Inner>)}
      </RichTextEditor>;
    }
    // ローディングの部品（Issue #136）：スピナーと進み具合
    if (element.type === 'spinner') {
      return <span key={element.id} {...props} role="status"><span className="rm-spinner" aria-hidden="true" />
        <span className="visually-hidden">{element.text || '読み込み中'}</span></span>;
    }
    if (element.type === 'progress') {
      const max = isNumber(element.max) && element.max > 0 ? element.max : 100;
      const value = isNumber(element.value) ? Math.min(max, Math.max(0, element.value)) : undefined;
      return <span key={element.id} {...props}><progress className="rm-progress" max={max} value={value} aria-label={element.text || '進み具合'} /></span>;
    }
    if (element.type === 'icon') {
      const size = iconSize(element, 24);
      const IconTag = nativeLink ? 'a' : 'span';
      return <IconTag key={element.id} {...props} {...linkProps}><IconSvg node={element.icon?.node} size={size} label={element.alt} /></IconTag>;
    }
    if (element.type === 'text') {
      if (parent?.type === 'label') return <span key={element.id} {...props}>{element.text}</span>;
      const TextTag = textTag(element) as 'p' | 'div' | 'ul' | 'ol';
      return nativeLink ? <a key={element.id} {...props} {...linkProps}>{TextTag === 'p' ? textContent(element, false) : <TextTag className="rm-link-text">{textContent(element, false)}</TextTag>}</a>
        : <TextTag key={element.id} {...props}>{textContent(element)}</TextTag>;
    }
    if (element.type === 'heading') {
      const Heading = headingTag(element.level);
      return nativeLink ? <a key={element.id} {...props} {...linkProps}><Heading className="rm-link-heading">{textContent(element, false)}</Heading></a> : <Heading key={element.id} {...props}>{textContent(element)}</Heading>;
    }
    if (element.type === 'image') {
      const src = element.src ? resolveAssetSrc(element.src, assetUrls) : null;
      const ImageTag = nativeLink ? 'a' : 'div';
      return <ImageTag key={element.id} {...props} {...linkProps}>
        {src ? <ScreenImage key={element.src} src={src}
          alt={element.decorative ? '' : element.alt ?? ''} editing={editing} width={element.imageWidth} height={element.imageHeight}
          style={element.imageFit || element.imagePosition ? { objectFit: element.imageFit, objectPosition: element.imagePosition } as CSSProperties : undefined}
          priority={element.loading === 'eager' || (element.loading !== 'lazy' && element.id === leadImageId)} />
          : editing && <span>画像URLを設定</span>}
      </ImageTag>;
    }
    if (element.type === 'data-list' || element.type === 'data-detail') {
      const id = element.binding?.datasetId ?? '';
      const dataset = datasetsById.get(id);
      const pageKey = JSON.stringify([element.id, id, scenarios?.[id]?.kind]);
      // 表の見出しの背景と線の色（Issue #240）：色のトークンを優先し、無ければ直接の値
      const view = element.listView;
      const color = (tokenId: string | undefined, value: string | undefined) => {
        const token = tokenId ? design?.tokens?.find((candidate) => candidate.id === tokenId && candidate.kind === 'color') : undefined;
        const literal = token ? tokenLiteral(design?.tokens ?? [], token) : undefined;
        return typeof literal === 'string' ? literal : value || undefined;
      };
      const tableVars = view?.layout === 'table' ? { '--rm-table-head': color(view.headerToken, view.headerColor), '--rm-table-line': color(view.lineToken, view.lineColor) } : {};
      const sectionStyle = Object.values(tableVars).some(Boolean) ? { ...(props.style ?? {}), ...tableVars } as CSSProperties : props.style;
      return <section key={element.id} {...props} style={sectionStyle} data-dataset-id={inspect && dataset ? id : undefined}
        aria-busy={scenarios?.[id]?.kind === 'loading' ? 'true' : undefined}><DataBlock
        element={element} dataset={dataset} records={dataset?.records ?? []} selection={recordsSelected[id]}
        page={dataPages[pageKey] ?? 0} onPageChange={(page) => setDataPages((current) => ({ ...current, [pageKey]: page }))}
        onRetry={onRetryDataset ? () => onRetryDataset(id) : undefined}
        shareImages={element.type === 'data-list' ? Boolean(element.sharedImage) : sharesImages(id)}
        editing={editing} inspect={inspect} scenario={scenarios?.[id]?.kind} onSelectRecord={(recordId) => {
          setRecordsSelected((current) => ({ ...current, [id]: recordId }));
          navigate(element.targetScreenId, { [id]: recordId }, element.sharedImage ? 'shared' : element.transition);
        }} /></section>;
    }
    const catalogState = inspect && element.type === 'catalog' ? (order.catalog.loading ? 'loading'
      : order.catalog.error ? 'error' : order.catalog.products.length ? 'normal' : 'empty') : undefined;
    if (!orderRuntime) return null;
    const { OrderBlock } = orderRuntime;
    return <section key={element.id} {...props} data-catalog-state={catalogState}><OrderBlock type={element.type} order={order}
      editing={editing} productFields={catalogFields} settings={element.statusMessages} onProductAdded={() => { playFeedback(); notifyState('added'); }} /></section>;
  }

  function renderOrderStatus(settings: StatusMessages | undefined) {
    if (order.pending) return <StatusMessage state="pending" settings={settings} fallback="注文内容を処理中…" />;
    if (order.error) return <StatusMessage state="error" settings={settings} fallback={order.error} onRetry={order.retry} />;
    return null;
  }

  // 状態ごとのスタイル（Issue #97）。書き出しでクラスにした要素は、クラスの hover: などで効く
  const ownClasses = screen ? elementClasses?.[screen.id] : undefined;
  const ownSignatures = screen ? elementSignatures?.[screen.id] : undefined;
  const stateElements = screen ? [...elementsFor(screen), ...(panelScreen ? elementsFor(panelScreen) : []), ...nestedScreens.flatMap(({ target }) => elementsFor(target))] : [];
  const classed = new Set<string>();
  (function collect(list: ElementData[], parent?: ElementData) {
    for (const item of list) {
      if (ownClasses?.[item.id] && (!ownSignatures?.[item.id] || ownSignatures[item.id] === styleSignature(item, parent))) classed.add(item.id);
      if (item.children) collect(item.children, item);
    }
  })(stateElements);
  function resolveStateElements(list: ElementData[]): ElementData[] {
    return list.map((item) => ({ ...resolveElement(item, design ?? undefined), ...(item.children ? { children: resolveStateElements(item.children) } : {}) }));
  }
  // スクロールのスナップ（Issue #185）。スクロールする側（ページの html）に付ける。編集中は効かせない（選択やドラッグの邪魔になる）
  const snap = screen?.snap?.type === 'proximity' || screen?.snap?.type === 'mandatory' ? screen.snap : null;
  const snapOffset = typeof snap?.offset === 'number' && Number.isFinite(snap.offset) && snap.offset > 0 ? snap.offset : 0;
  const stateCss = screen ? stateRules(resolveStateElements(stateElements), { editing, forced: forcedState, skip: (id) => classed.has(id), breakpoints, width: viewportWidth }) : '';
  return <div className={`screen ${editing ? 'editing' : ''}`} ref={screenRoot}
    data-background={screenBackground ? '' : undefined}
    data-content-max={Number.isInteger(contentMaxWidth) ? '' : undefined}
    data-full-bleed={screen?.fullBleed ? '' : undefined}
    data-snap={snap ? snap.type : undefined}
    style={{ ...elementStyle({ style: screen?.layout }, breakpoints, viewportWidth), ...(screenBackground ? { '--screen-background': screenBackground } : {}),
      ...(snapOffset ? { '--rm-snap-offset': `${snapOffset}px` } : {}),
      ...(Number.isInteger(contentMaxWidth) ? { '--content-max': `${contentMaxWidth}px` } : {}) } as CSSProperties}
    onFocus={revealFocus}
    data-screen-id={screen?.id} data-cart-count={inspect ? order.summary.count : undefined}
    data-order-state={inspect ? order.actionState : undefined}
    tabIndex={editing ? undefined : -1} role={editing ? undefined : 'region'}
    aria-label={editing ? undefined : screen?.name || '画面'}>
    {stateCss && <style>{stateCss}</style>}
    {toasts.length > 0 && <div className="rm-action-toasts">{toasts.map((entry) => {
      const component = entry.componentId ? design?.components.find(({ id }) => id === entry.componentId) : undefined;
      let body: ReactNode = null;
      if (component) {
        const message = toastMessagePart(component.root);
        const variantId = component.variants?.find(({ name }) => toastVariantNames[entry.tone].includes(name))?.id;
        const instance: ElementData = { id: `toast-${entry.id}`, type: component.type, componentId: component.id, style: {}, ...(variantId ? { variantId } : {}),
          childOverrides: message ? { [message.id]: { text: entry.text } } : {} };
        body = materializeElements([instance], design).map((element) => renderElement(element));
      }
      return <ToastItem key={entry.id} entry={entry} custom={Boolean(component)} onClose={() => dismissToast(entry.id)}>{body}</ToastItem>;
    })}</div>}
    {screen && !directOverlay && renderStateErrors(screen)}
    {screen && !directOverlay && (!editing && screen.overlay ? <button type="button" onClick={() => setDirectClosed(null)}>重ねる画面を開く</button> : renderScreen(screen))}
    {panelScreen?.overlay && livePanel ? <OverlayPanel key={`${panelScreen.id}:${panelScreen.overlay.kind}:${editing ? 'edit' : 'interact'}`} closeRef={panelRef} screen={panelScreen} onClose={closeCart}
      anchor={'anchor' in livePanel ? livePanel.anchor : undefined} backgroundColor={panelBackground} fixed={fixedOverlay} editing={editing}
      contentStyle={elementStyle({ style: panelScreen.layout }, breakpoints, viewportWidth)}>
      {renderStateErrors(panelScreen)}
      {elementsFor(panelScreen).map((element) => renderElement(element, true))}
    </OverlayPanel> : panelScreen && livePanel && <SheetPanel key={livePanel.sequence ?? panelScreen.id} closeRef={panelRef} screen={panelScreen}
      settings={livePanel.element.motion} onClose={closeCart} trialClose={livePanel.trialClose}
      backgroundColor={panelBackground} closeLocked={order.pending || order.orderOutcomeUnknown}>
      {renderStateErrors(panelScreen)}
      {elementsFor(panelScreen).map((element) => renderElement(element, true))}
      {renderOrderStatus(panelScreen.orderStatusMessages)}
    </SheetPanel>}
    {/* 入れ子の重ねる画面（Issue #249）：下から順に積む。モーダルなら下の画面は操作できず、閉じるとその画面を開いた要素へフォーカスが戻る */}
    {nestedScreens.map(({ entry, target }, index) => <OverlayPanel key={`${target.id}:${entry.sequence}`} closeRef={nestedRef(target.id)} screen={target}
      onClose={() => closeNested(index)} anchor={entry.anchor} backgroundColor={resolveBackground(target.background, design?.tokens) ?? commonBackground} editing={editing}
      contentStyle={elementStyle({ style: target.layout }, breakpoints, viewportWidth)}>
      {renderStateErrors(target)}
      {elementsFor(target).map((element) => renderElement(element, target))}
    </OverlayPanel>)}
    {!panelScreen && renderOrderStatus(screen?.orderStatusMessages)}
  </div>;
}
