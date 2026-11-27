/**
 * HTTPスタブ用の参照アダプター。src/order.ts の createMockOrderApi と同じ形
 * （listProducts・quoteOrder(items)・submitOrder(quoteId, key)）で呼べる。
 * スタブの検証と書き出し先のHTTP接続で同じ実装を使う。
 *
 * - timeout：1回の要求の待ち時間（ms）。超えたら中断して再試行する
 * - retries：503・通信失敗・タイムアウトのときの再試行回数。確定は同じ Idempotency-Key で再送する
 */
import type { OrderApi, OrderQuote, OrderReceipt, Product } from '../site-types.ts';

export class OrderHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalidResponse() {
  return new OrderHttpError(0, 'invalid_response', 'APIから正しい注文データを受け取れませんでした。');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProduct(item: unknown): item is Product {
  return isObject(item) && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.price === 'number'
    && Number.isSafeInteger(item.price) && item.price >= 0;
}

function isQuote(quote: unknown): quote is OrderQuote {
  return isObject(quote) && typeof quote.id === 'string' && Number.isSafeInteger(quote.count) && Number.isSafeInteger(quote.total)
    && Array.isArray(quote.lines) && quote.lines.every((line: unknown) =>
      isObject(line) && Number.isSafeInteger(line.quantity) && isProduct(line));
}

function isReceipt(order: unknown, quoteId: string): order is OrderReceipt {
  return isObject(order) && typeof order.id === 'string' && order.quoteId === quoteId && Number.isSafeInteger(order.total);
}

type HttpOptions = {
  timeout?: number;
  retries?: number;
  fetch?: typeof globalThis.fetch;
  onAttempt?: (attempt: { path: string; attempt: number }) => void;
};

export function createHttpOrderApi(baseUrl: string | URL, { timeout = 8000, retries = 2, fetch = globalThis.fetch, onAttempt }: HttpOptions = {}): OrderApi {
  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        onAttempt?.({ path, attempt });
        const response = await fetch(new URL(path, baseUrl), { ...init, signal: controller.signal });
        const body: unknown = await response.json().catch((failure: unknown) => {
          if (controller.signal.aborted || !(failure instanceof SyntaxError) || response.ok) throw failure;
          return {};
        });
        if (response.ok) return body;
        const details = isObject(body) ? body : {};
        const error = new OrderHttpError(response.status, typeof details.code === 'string' ? details.code : 'error',
          typeof details.message === 'string' ? details.message : '処理できませんでした。');
        if (response.status !== 503) throw error; // 入力の誤り・競合は再試行しない
        lastError = error;
      } catch (failure) {
        if (failure instanceof OrderHttpError && failure.status !== 503) throw failure;
        if (failure instanceof SyntaxError && !controller.signal.aborted) {
          throw new OrderHttpError(0, 'invalid_response', 'APIから正しいJSONを受け取れませんでした。');
        }
        lastError = controller.signal.aborted ? new OrderHttpError(0, 'timeout', '応答がありませんでした。') : failure;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  const json = (body: object, headers: Record<string, string> = {}): RequestInit =>
    ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  return {
    async listProducts() {
      const products = await request('/products');
      if (!Array.isArray(products) || !products.every(isProduct)) throw invalidResponse();
      return products;
    },
    async quoteOrder(items) {
      const quote = await request('/quotes', json({ items }));
      if (!isQuote(quote)) throw invalidResponse();
      return quote;
    },
    async submitOrder(quoteId, key) {
      try {
        const order = await request('/orders', json({ quoteId }, { 'Idempotency-Key': key }));
        if (!isReceipt(order, quoteId)) throw invalidResponse();
        return order;
      } catch (failure) {
        if (failure instanceof OrderHttpError && [400, 404, 409].includes(failure.status)) throw failure;
        throw Object.assign(new Error('確定結果を確認できませんでした。同じ注文を再試行してください。', { cause: failure }),
          { orderOutcomeUnknown: true });
      }
    },
  };
}
