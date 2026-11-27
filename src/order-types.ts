// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 注文の型（Issue #137）。注文を使わないサイトの書き出しにも入れる（共通の描画 ScreenView が型だけを使う）。
 * 実装は order.ts・order-runtime.tsx・OrderBlock.tsx（注文を使うサイトにだけ入る）
 */
import type { ComponentType } from 'react';
import type { DataField, ElementData, ProductData, StatusMessages } from './model-types.ts';

export type Quantities = Record<string, number>;
export type OrderLine = ProductData & { quantity: number };
export type OrderSummary = { lines: OrderLine[]; count: number; total: number };
export type OrderQuote = OrderSummary & { id: string };
export type OrderReceipt = { id: string; quoteId: string; total: number };

/** 注文の送り先（src/integrations/order-api.ts で差し替える） */
export interface OrderApi {
  listProducts(): Promise<ProductData[]>;
  quoteOrder(items: Array<{ id: string; quantity: number }>): Promise<OrderQuote>;
  submitOrder(quoteId: string, key: string): Promise<OrderReceipt>;
}

export type OrderAction = 'quote' | 'submit' | 'reset';
/** プレビューの条件（読み込み中・空・失敗・送信中）。操作ごと */
export type OrderScenario = { catalog?: string; quote?: string; submit?: string };
export type OrderCatalog = { products: ProductData[]; loading?: boolean; error?: string };

/** 注文の状態と操作（order-runtime.tsx の useOrder） */
export interface OrderState {
  catalog: OrderCatalog;
  summary: OrderSummary;
  setQuantity: (id: string, value: number) => void;
  quote: OrderQuote | null;
  receipt: OrderReceipt | null;
  pending: boolean;
  orderOutcomeUnknown: boolean;
  error: string;
  run: (action: OrderAction, navigate: () => void) => Promise<void>;
  clearError: () => void;
  actionState: string | undefined;
  retryCatalog: () => void;
  retry: () => void;
}

/** 商品一覧・カート・確認・完了の表示に要るもの（登録部品の注文の見本も同じ形で渡す） */
export type OrderBlockState = Pick<OrderState, 'catalog' | 'summary' | 'quote' | 'receipt' | 'setQuantity' | 'pending' | 'orderOutcomeUnknown' | 'retryCatalog'>;

export type OrderBlockProps = {
  type: string;
  order: OrderBlockState;
  editing: boolean;
  productFields: DataField[];
  onProductAdded: () => void;
  settings?: StatusMessages;
};

/** order-runtime.tsx の中身（ScreenView は、このファイルがあるときだけ注文を扱う） */
export type OrderRuntime = {
  useOrder: (products: ProductData[], api: OrderApi | null | undefined, scenario: OrderScenario | null | undefined, enabled: boolean) => OrderState;
  hasOrderElements: (elements: Array<Pick<ElementData, 'type' | 'action' | 'children'>>) => boolean;
  yen: (value: number) => string;
  OrderBlock: ComponentType<OrderBlockProps>;
};
