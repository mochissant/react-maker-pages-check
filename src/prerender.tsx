// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 画面を事前に描く（Issue #174）。書き出したリポジトリの scripts/prerender.mjs が、vite build のあとに Vite の SSR で読む。
 * 画面ごとの HTML（#158 の seo.json の画面）の #root に、その画面を描いた結果を入れる。JavaScript が動けば、今と同じく React が描き直す。
 * データの取得先（src/site-data.ts）があるサイトでは、ダミーデータを本物として見せないよう、データ一覧・詳細は「読み込み中」として描く。
 * ただし詳細画面の行ごとのページ（Issue #245）は、ダミーデータの行を中身として描く（画面設定で選んだもの）
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScreenView } from './ScreenView.tsx';
import type { SiteProject } from './site-types';
import project from './generated/project.json';
import { localizeScreen } from './i18n.ts';

const fetchesData = Object.keys(import.meta.glob('./site-data.ts')).length > 0;

export function renderScreenHtml(screenId: string, locale?: string | null, records?: Record<string, string>): string | null {
  const raw = project as unknown as SiteProject;
  // 多言語（Issue #182）：その言語の文言で描く
  const site = { ...raw, screens: raw.screens.filter((screen) => screen.status !== 'draft').map((screen) => localizeScreen(screen, locale, raw.locales?.base)) };
  const screen = site.screens.find(({ id }) => id === screenId);
  if (!screen) return null;
  // 行ごとのページ（Issue #245）は、利用者が選んだ「ダミーデータの行」を中身として描く（データの取得先があっても）
  const scenarios = fetchesData && !records ? Object.fromEntries((site.datasets ?? []).map(({ id }) => [id, { kind: 'loading' }])) : undefined;
  const assetUrls = Object.fromEntries((site.assets ?? []).map(({ id, file }) => [id, `${import.meta.env.BASE_URL}assets/${file}`]));
  return renderToString(<main><ScreenView screen={screen} mode="interact" products={site.products} productFields={site.productFields} design={site.designSystem}
    breakpoints={site.breakpoints} datasets={site.datasets} scenarios={scenarios} screens={site.screens} startScreenId={site.startScreenId} background={site.background}
    contentMaxWidth={site.contentMaxWidth} elementClasses={site.elementClasses} elementSignatures={site.elementSignatures} assetUrls={assetUrls}
    routeRecords={records} onNavigate={() => {}} /></main>);
}
