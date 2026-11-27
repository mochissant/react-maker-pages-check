// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { ProjectData, ScreenData } from './model-types.ts';

/** 公開できる通常画面だけを404の表示に使う。設定が無効なら既定の案内へ戻す（#236）。 */
export function notFoundScreen(project: Pick<ProjectData, 'screens' | 'startScreenId' | 'seo'>): ScreenData | undefined {
  const id = project.seo?.notFoundScreenId;
  return typeof id === 'string' ? project.screens.find((screen) => screen.id === id && screen.id !== project.startScreenId && screen.status !== 'draft' && !screen.overlay) : undefined;
}
