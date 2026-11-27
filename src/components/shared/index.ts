// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
// react-maker が生成。共通部品の id → コンポーネントと、配置の上書きを props にする対応（Issue #107）
import type { ComponentType } from 'react';
import Component3 from './Component3';

export type SharedComponent = {
  Component: ComponentType<Record<string, unknown>>;
  /** バリアントの id（基本は 'base'）→ variant の値 */
  variants: Record<string, string>;
  /** 部品の中の要素の id → props の名前 */
  parts: Record<string, { text?: string; src?: string; alt?: string; press?: string }>;
};

export const sharedComponents: Record<string, SharedComponent> = {
  "dd61f41d-3d79-426d-be82-4e209705c08b": { Component: Component3 as ComponentType<Record<string, unknown>>, variants: {"base":"base"}, parts: {"cc428c9c-25a7-4ad8-9678-e060fee9988a":{},"d6c72088-23fb-4c8a-912b-c2c1b4c77c2c":{},"778888ee-f63c-4b72-bd27-42e3bd640bbf":{"text":"text2Text"},"ca961462-9e86-4f09-bd8f-266dd0b4e752":{},"ff7b6c89-ba18-4582-8719-5522e242e874":{"text":"text3Text"},"a3bec291-691c-400d-8cf9-22baa02cc259":{"text":"text4Text"}} },
};
