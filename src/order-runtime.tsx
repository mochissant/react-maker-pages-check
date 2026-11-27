// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 注文の機能（商品一覧・カート・見積・確定）。共通の描画（ScreenView）は、このファイルがあるときだけ注文を扱う（Issue #109）。
 * 注文を使わないサイトの書き出しには、このファイルと order.ts・OrderBlock.tsx を入れない
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { changeQuantity, createMockOrderApi, hasOrderElements, orderSummary, yen } from './order.ts';
import type { OrderAction, OrderApi, OrderCatalog, OrderQuote, OrderReceipt, OrderScenario, OrderState, Quantities } from './order-types.ts';
import type { ProductData } from './model-types.ts';

export { OrderBlock } from './OrderBlock.tsx';
export { hasOrderElements, yen };

const emptyProducts: ProductData[] = [];

type ApiAction = Exclude<OrderAction, 'reset'>;
type Catalog = OrderCatalog;

export function useOrder(products: ProductData[], api: OrderApi | null | undefined, scenario: OrderScenario | null | undefined, enabled: boolean): OrderState {
  const [catalog, setCatalog] = useState<Catalog>({ products: emptyProducts, loading: true });
  const [quantities, setQuantities] = useState<Quantities>({});
  const [quotedOrder, setQuotedOrder] = useState<{ api: OrderApi; quote: OrderQuote } | null>(null);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [pendingAction, setPendingAction] = useState<ApiAction | null>(null);
  const [error, setError] = useState('');
  const [orderOutcomeUnknown, setOrderOutcomeUnknown] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retriedCatalog, setRetriedCatalog] = useState(false);
  const [simulatedPending, setSimulatedPending] = useState<ApiAction | null>(null);
  const failedActions = useRef(new Set<ApiAction>());
  const retryAction = useRef<{ action: OrderAction; navigate: () => void } | null>(null);
  const inFlight = useRef(false);
  const requestKey = useRef<string | null>(null);
  const orderApi = useMemo(() => api ?? createMockOrderApi(products), [api, products]);
  const quote = quotedOrder?.api === orderApi ? quotedOrder.quote : null;
  const catalogScenario = scenario?.catalog;
  const quoteScenario = scenario?.quote;
  const submitScenario = scenario?.submit;

  useEffect(() => { setRetriedCatalog(false); }, [catalogScenario]);
  useEffect(() => { failedActions.current.delete('quote'); }, [quoteScenario]);
  useEffect(() => { failedActions.current.delete('submit'); }, [submitScenario]);
  useEffect(() => {
    setSimulatedPending((action) => (action === 'quote' ? quoteScenario : submitScenario) === 'pending' ? action : null);
  }, [quoteScenario, submitScenario]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    setCatalog({ products: emptyProducts, loading: true });
    orderApi.listProducts().then(
      (items) => { if (active) setCatalog({ products: items }); },
      () => { if (active) setCatalog({ products: emptyProducts, error: '商品を読み込めませんでした。' }); },
    );
    return () => { active = false; };
  }, [attempt, orderApi, enabled]);

  const summary = orderSummary(catalog.products, quantities);
  const displayedCatalog: Catalog = catalogScenario === 'loading' ? { products: emptyProducts, loading: true }
    : catalogScenario === 'empty' ? { products: emptyProducts }
    : catalogScenario === 'error' && !retriedCatalog ? { products: emptyProducts, error: '商品を読み込めませんでした。' }
    : catalog;
  const activeAction = pendingAction ?? (simulatedPending && scenario?.[simulatedPending] === 'pending' ? simulatedPending : null);

  function clearError() {
    setError('');
    retryAction.current = null;
  }

  function setQuantity(id: string, value: number) {
    if (orderOutcomeUnknown || inFlight.current) return;
    setQuantities((current) => changeQuantity(current, id, value));
    setQuotedOrder(null);
    clearError();
  }

  async function run(action: OrderAction, navigate: () => void) {
    if (inFlight.current || activeAction || (orderOutcomeUnknown && action !== 'submit')) return;
    if (action === 'reset') {
      setQuantities({});
      setQuotedOrder(null);
      setReceipt(null);
      requestKey.current = null;
      clearError();
      setSimulatedPending(null);
      navigate();
      return;
    }
    if (action === 'submit' && (!quote || !requestKey.current)) return;
    clearError();
    if (scenario?.[action] === 'pending') {
      setSimulatedPending(action);
      return;
    }
    setSimulatedPending(null);
    inFlight.current = true;
    setPendingAction(action);
    try {
      if (scenario?.[action] === 'error' && !failedActions.current.has(action)) {
        failedActions.current.add(action);
        throw new Error(action === 'quote' ? '見積を取得できませんでした。' : '注文を確定できませんでした。');
      }
      if (action === 'quote') {
        const nextQuote = await orderApi.quoteOrder(summary.lines.map(({ id, quantity }) => ({ id, quantity })));
        setQuotedOrder({ api: orderApi, quote: nextQuote });
        setReceipt(null);
        requestKey.current = crypto.randomUUID();
      } else if (action === 'submit') {
        if (quote && requestKey.current) setReceipt(await orderApi.submitOrder(quote.id, requestKey.current));
        setOrderOutcomeUnknown(false);
      }
      navigate();
    } catch (failure) {
      // 送信の結果が分からない失敗（通信が切れたなど）は、注文し直さないよう操作を止める。アダプターが orderOutcomeUnknown を付ける
      if (action === 'submit') setOrderOutcomeUnknown(Boolean((failure as { orderOutcomeUnknown?: unknown } | null)?.orderOutcomeUnknown));
      retryAction.current = { action, navigate };
      setError(failure instanceof Error ? failure.message : '処理できませんでした。もう一度お試しください。');
    } finally {
      inFlight.current = false;
      setPendingAction(null);
    }
  }

  return {
    catalog: displayedCatalog, summary, setQuantity, quote, receipt, pending: Boolean(activeAction), orderOutcomeUnknown, error, run, clearError,
    actionState: activeAction ? `${activeAction}-pending` : error && retryAction.current ? `${retryAction.current.action}-error`
      : receipt ? 'receipt' : quote ? 'quoted' : undefined,
    retryCatalog: () => { setRetriedCatalog(true); setAttempt((previous) => previous + 1); },
    retry: () => { if (retryAction.current) void run(retryAction.current.action, retryAction.current.navigate); },
  };
}
