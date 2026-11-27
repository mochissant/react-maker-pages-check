// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { ReactNode } from 'react';
import type { BackgroundSetting, Breakpoint, DataField, DatasetData, DesignSystemData, ElementData, ProductData, ProjectData, ScreenData } from './model-types.ts';

export type CustomComponentContext = {
  children: ReactNode;
  interactive: boolean;
  onActivate: () => void;
  /** 部品の中で変わった値を、画面の状態へ返す（Issue #242。つないだ項目だけ効く） */
  onValueChange?: (name: string, value: unknown) => void;
  /** 要素設定の「要素の状態表示」（送信中・成功・失敗などの文言。Issue #118） */
  statusMessages?: Readonly<Record<string, { text?: string; retryLabel?: string; presentation?: string } | undefined>>;
};

export type DatasetValue = string | number | boolean | readonly string[] | null;
export type ComponentDataset = {
  readonly id: string;
  readonly name: string;
  readonly fields: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly type: 'text' | 'number' | 'boolean' | 'select' | 'datetime' | 'image' | 'tags';
    readonly options?: readonly string[];
  }>;
  readonly records: ReadonlyArray<{
    readonly id: string;
    readonly values: Readonly<Partial<Record<string, DatasetValue>>>;
  }>;
  readonly status: 'ready' | 'empty' | 'loading' | 'error';
};

/** 注文の型は order-types.ts、案件データの型は model-types.ts（共有ランタイムと同じもの。Issue #137） */
export type { OrderApi, OrderQuote, OrderReceipt } from './order-types.ts';
export type OrderItem = { id: string; quantity: number };
export type Product = ProductData;

export type SiteElement = ElementData;
export type Background = BackgroundSetting;
export type SiteScreen = ScreenData;

export interface SiteProject {
  name?: string;
  seo?: ProjectData['seo'];
  /** アクセス解析・フォームの送信先・Cookie の同意（Issue #175） */
  services?: { ga4?: string; formEndpoint?: string; privacyUrl?: string; consentText?: string; analytics?: { provider: 'umami'; scriptUrl: string; websiteId: string } | { provider: 'goatcounter'; endpoint: string } | null } | null;
  locales?: { base: string; baseName?: string; others: Array<{ code: string; name: string }> } | null;
  loading?: { screenId?: string; minDuration?: number; oncePerVisit?: boolean };
  assets?: Array<{ id: string; name: string; file: string; mime: string; width?: number; height?: number }>;
  contentMaxWidth?: number;
  description?: string;
  background?: BackgroundSetting;
  elementClasses?: Record<string, Record<string, string>>;
  /** 書き出し時のスタイルの署名。合わない要素はクラスを使わない（Issue #116） */
  elementSignatures?: Record<string, Record<string, string>>;
  startScreenId: string | null;
  screens: ScreenData[];
  products: ProductData[];
  productFields: DataField[];
  designSystem: DesignSystemData;
  breakpoints: Breakpoint[];
  datasets: DatasetData[];
}
