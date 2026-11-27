// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
// react-maker が生成。画面のファイルが受け取るもの（Issue #106）
import type { ReactNode } from 'react';

export type ScreenParts = {
  /** 共通の描画で、要素を1つ描く（ボタン・画像・データ・部品など） */
  element: (id: string) => ReactNode;
};
