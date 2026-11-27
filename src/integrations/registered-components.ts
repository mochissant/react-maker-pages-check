import { customComponents } from './components';

type RegisteredComponent = {
  label: string;
  fields: Record<string, { label: string; type: 'dataset' } | {
    label: string;
    type: 'text' | 'number' | 'boolean' | 'select' | 'color' | 'image';
    initial: string | number | boolean;
    options?: readonly string[];
  }>;
  actions?: Readonly<Record<string, string | { label: string; unknown?: boolean; empty?: boolean; invalid?: boolean; success?: boolean }>>;
  sample?: boolean;
  generic?: boolean;
  childless?: boolean;
  /** 要素設定の「要素の状態表示」で文言を決める状態（Issue #118） */
  statusStates?: readonly string[];
};

const samples = import.meta.glob<Record<string, RegisteredComponent>>('./order-sample.tsx', { eager: true, import: 'orderSampleComponents' });
// イベント案内の見本（参加受付）。書き出したサイトでは、使うときだけ入る（Issue #252）
const eventSamples = import.meta.glob<Record<string, RegisteredComponent>>('./event-sample.tsx', { eager: true, import: 'eventSampleComponents' });
// プロジェクトで定義した部品（Issue #110）。書き出したサイトにだけある。編集GUIでは project-components.js が実行時に足す
const project = import.meta.glob<Record<string, RegisteredComponent>>('../components/project/index.ts', { eager: true, import: 'projectComponents' });
export const registeredComponents: Record<string, RegisteredComponent & { View?: unknown; code?: boolean }> = {
  ...customComponents, ...eventSamples['./event-sample.tsx'], ...samples['./order-sample.tsx'], ...project['../components/project/index.ts'],
};
