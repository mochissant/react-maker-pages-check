// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
// react-maker が生成。画面の id → 画面のコンポーネント（Issue #106）
import type { ComponentType } from 'react';
import type { ScreenParts } from './types';
import LpPage, { signature as LpPageSignature } from './LpPage';
import Page1Page, { signature as Page1PageSignature } from './Page1Page';
import Page2Page, { signature as Page2PageSignature } from './Page2Page';
import Page3Page, { signature as Page3PageSignature } from './Page3Page';
import Page4Page, { signature as Page4PageSignature } from './Page4Page';

export const screenComponents: Record<string, { Component: ComponentType<ScreenParts>; signature: string }> = {
  "90ca1973-e446-4a92-88c4-f5edcf8a5178": { Component: LpPage, signature: LpPageSignature },
  "45c22070-73f5-4087-b031-b3e51685587b": { Component: Page1Page, signature: Page1PageSignature },
  "e9affcf7-9e11-49a2-84d0-36eae251d5e4": { Component: Page2Page, signature: Page2PageSignature },
  "275de1c5-ef0f-46b9-9632-ef6599c68cda": { Component: Page3Page, signature: Page3PageSignature },
  "dd408b86-b443-4b3f-9b8c-31f754bf96de": { Component: Page4Page, signature: Page4PageSignature },
};
