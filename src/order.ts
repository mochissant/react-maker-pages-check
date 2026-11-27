// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { ElementData, ProductData } from './model-types.ts';
import type { OrderApi, OrderLine, OrderQuote, OrderReceipt, Quantities } from './order-types.ts';

export type { OrderApi, OrderLine, OrderQuote, OrderReceipt, Quantities };

export const MAX_QUANTITY = 999;
const orderElementTypes = new Set(['catalog', 'cart', 'review', 'receipt']);

export function hasOrderElements(elements: Array<Pick<ElementData, 'type' | 'action' | 'children'>>): boolean {
  return elements.some(({ type, action, children }) =>
    orderElementTypes.has(type) || Boolean(action) || Boolean(children && hasOrderElements(children)));
}

export const MAX_PRICE = 100_000_000;
export const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format;

export function changeQuantity(quantities: Quantities, productId: string, quantity: number) {
  const next = { ...quantities };
  if (quantity > 0) next[productId] = Math.min(quantity, MAX_QUANTITY);
  else delete next[productId];
  return next;
}

export function orderSummary(products: ProductData[], quantities: Quantities) {
  const lines = products.filter(({ id }) => quantities[id] > 0).map((product): OrderLine => ({
    ...product, quantity: quantities[product.id],
  }));
  return {
    lines,
    count: lines.reduce((count, line) => count + line.quantity, 0),
    total: lines.reduce((total, line) => total + line.price * line.quantity, 0),
  };
}

export function createMockOrderApi(products: ProductData[]): OrderApi {
  const quotes = new Map<string, OrderQuote>();
  const orders = new Map<string, OrderReceipt>();
  let nextQuote = 1;

  return {
    async listProducts() {
      return products;
    },
    async quoteOrder(items) {
      const summary = orderSummary(products, Object.fromEntries(items.map(({ id, quantity }) => [id, quantity])));
      if (!summary.count) throw new Error('カートに商品を追加してください。');
      const quote = { ...summary, id: `quote-${nextQuote++}` };
      quotes.set(quote.id, quote);
      return quote;
    },
    async submitOrder(quoteId, key) {
      const existing = orders.get(key);
      if (existing) {
        if (existing.quoteId !== quoteId) throw new Error('注文内容を確認し直してください。');
        return existing;
      }
      const quote = quotes.get(quoteId);
      if (!quote) throw new Error('注文内容を確認し直してください。');
      const order = { id: `DEMO-${orders.size + 1}`, quoteId, total: quote.total };
      orders.set(key, order);
      return order;
    },
  };
}
