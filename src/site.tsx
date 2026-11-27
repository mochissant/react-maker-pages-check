// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ScreenView } from './ScreenView.tsx';
import type { OrderApi, SiteProject } from './site-types';
import type { DataScenario } from './model-types.ts';
import { siteRoutes } from './routes.ts';
import { notFoundScreen } from './not-found.ts';
import { PreviewComments } from './PreviewComments.tsx';
import { SiteServicesView } from './site-services.tsx';
import { setSiteConfig } from './site-config.ts';
import { localeFromPath, localizeScreen } from './i18n.ts';
import project from './generated/project.json';
import './integrations/site.css';

const adapters = import.meta.glob<OrderApi | undefined>('./integrations/site-adapters.ts', { eager: true, import: 'orderApi' });
const orderApi = adapters['./integrations/site-adapters.ts'];

// データの取得（Issue #117）：データ一覧があるサイトだけ、dataApi（src/integrations/data-api.ts）で取得する
type SiteData = { datasets: SiteProject['datasets']; scenarios?: Record<string, DataScenario | undefined>; retry?: (id: string) => void };
const dataModules = import.meta.glob<(site: SiteProject) => SiteData>('./site-data.ts', { eager: true, import: 'useSiteDatasets' });
const useSiteDatasets = dataModules['./site-data.ts'] ?? ((site: SiteProject): SiteData => ({ datasets: site.datasets }));

// 部品のドキュメント（Issue #180）：閲覧用のURL（preview）だけ、design-system/ に出す。本番では読み込まない
const docsModules = import.meta.glob<{ default: unknown }>('./generated/component-docs.json');
const DesignSystemDocs = lazy(() => import('./SiteDocs.tsx'));
const docsPrefix = `${import.meta.env.BASE_URL}design-system`;
const docsSlug = (path: string) => (path === docsPrefix || path.startsWith(`${docsPrefix}/`) ? path.slice(docsPrefix.length).replace(/^\/+|\/+$/g, '') : null);

type Route = { screenId: string; records: Record<string, string> } | null;
type HistoryState = { scrollY?: number } | null;
type PageMetadata = { screenId: string; locale?: string; canonical?: string; noindex?: boolean; title?: string; records?: Record<string, string> };
const metadataModules = import.meta.glob<PageMetadata[]>('./generated/seo.json', { eager: true, import: 'default' });
const pageMetadata = metadataModules['./generated/seo.json'] ?? [];

// 戻る・進むのスクロール位置は、履歴ごとに自分で戻す（画面の描画が終わってから戻すため）
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function setDescription(text: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!text) { meta?.remove(); return; }
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.append(meta);
  }
  meta.content = text;
}

function Site() {
  // project.json は利用者や AI が直接書き換えるので、形の確認は型ではなく npm run check:project（スキーマと検査）と描画時の検証で行う
  // 下書きの画面（Issue #173）は、サイトに出さない
  // 多言語（Issue #182）：URL の頭の言語（/en/…）で、その言語の文言にする。基準言語は / のまま
  const raw = project as unknown as SiteProject;
  const [{ locale, root: localeRoot }] = useState(() => localeFromPath(location.pathname, import.meta.env.BASE_URL, raw.locales));
  const site = useMemo(() => ({ ...raw, screens: raw.screens.filter((screen) => screen.status !== 'draft').map((screen) => localizeScreen(screen, locale, raw.locales?.base)) }), [raw, locale]);
  const data = useSiteDatasets(site);
  const routes = useMemo(() => siteRoutes(site, localeRoot), [site, localeRoot]);
  useLayoutEffect(() => { if (locale) document.documentElement.lang = locale; }, [locale]);
  // 素材のファイル（public/assets/）の URL。Issue #98
  const assetUrls = useMemo(() => Object.fromEntries((site.assets ?? []).map(({ id, file }) => [id, `${import.meta.env.BASE_URL}assets/${file}`])), [site]);
  const [route, setRoute] = useState<Route>(() => routes.resolve(location.pathname));
  const lastPath = useRef(location.pathname);
  // ローディング画面（Issue #136）：最低表示時間だけ出してから、本来の画面へ切り替える
  const loading = site.loading;
  const [loadingDone, setLoadingDone] = useState(() => {
    if (!loading?.screenId || !site.screens.some(({ id }) => id === loading.screenId)) return true;
    try { return loading.oncePerVisit !== false && sessionStorage.getItem('rm-loading-shown') === '1'; } catch { return false; }
  });
  useEffect(() => {
    if (loadingDone) return undefined;
    const timer = setTimeout(() => {
      try { sessionStorage.setItem('rm-loading-shown', '1'); } catch { /* 次も出す */ }
      const swap = () => setLoadingDone(true);
      if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        // 飛ばされた切り替え（AbortError）は、ふつうのこと（Issue #270）
        const running = document.startViewTransition(swap);
        running.ready.catch(() => {});
        running.finished.catch(() => {});
      }
      else swap();
    }, loading?.minDuration ?? 800);
    return () => clearTimeout(timer);
  }, [loadingDone, loading]);
  const screen = route ? site.screens.find(({ id }) => id === route.screenId) : notFoundScreen(site);
  const projectName = typeof site.name === 'string' ? site.name.trim() : '';
  const pageName = screen ? screen.name.trim() : 'ページが見つかりません';
  // 画面ごとのタイトル（Issue #158）：上書きがあればそれ、無ければ「画面名 | サイト名」（開始画面はサイト名）
  // 行ごとのページ（Issue #245）：その行のタイトルと canonical（seo.json の records が、開いている行と同じもの）
  const recordMetadata = route && Object.keys(route.records).length ? pageMetadata.find((entry) => entry.screenId === screen?.id && entry.records
    && Object.entries(entry.records).every(([datasetId, recordId]) => route.records[datasetId] === recordId)) : undefined;
  const title = recordMetadata?.title || screen?.seo?.title?.trim() || (screen && screen.id === site.startScreenId ? projectName : [pageName, projectName].filter(Boolean).join(' | ')) || 'サイト';
  const description = (screen?.description ?? site.description ?? '').trim();

  useLayoutEffect(() => {
    document.title = title;
    setDescription(description);
    const metadata = recordMetadata ?? pageMetadata.find((entry) => entry.screenId === screen?.id && !entry.records && (!entry.locale || entry.locale === locale));
    const noindex = Boolean(previewRepository || !route || screen?.id === notFoundScreen(site)?.id || metadata?.noindex || screen?.seo?.noindex);
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noindex) {
      if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
      robots.content = previewRepository ? 'noindex, nofollow' : 'noindex';
    } else robots?.remove();
    const canonical = route ? metadata?.canonical : '';
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical && /^https?:\/\//.test(canonical)) {
      if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.append(link); }
      link.href = canonical;
    } else link?.remove();
  }, [title, description, screen, locale, route, site, recordMetadata]);

  // 戻る・進む：URLから画面とレコードを決め直し、そのときのスクロール位置に戻す
  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      // パネルを閉じる・開くための「戻る」「進む」（同じ URL）では、画面とスクロールを変えない（Issue #130）
      if (location.pathname === lastPath.current) return;
      lastPath.current = location.pathname;
      setRoute(routes.resolve(location.pathname));
      const scrollY = (event.state as HistoryState)?.scrollY ?? 0;
      requestAnimationFrame(() => scrollTo(0, scrollY));
    }
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, [routes]);

  function navigate(screenId: string, records: Record<string, string>) {
    history.replaceState({ ...(history.state as HistoryState), scrollY }, '');
    const path = routes.pathOf(screenId, records);
    if (path !== location.pathname) history.pushState({ scrollY: 0 }, '', path);
    lastPath.current = path;
    setRoute({ screenId, records });
    scrollTo(0, 0);
  }

  const docsLoader = docsModules['./generated/component-docs.json'];
  if (previewRepository && docsLoader && docsSlug(location.pathname) !== null) {
    return <Suspense fallback={<main aria-busy="true" />}><DesignSystemDocs load={docsLoader} site={site} assetUrls={assetUrls} prefix={docsPrefix} initialSlug={docsSlug(location.pathname) ?? ''} /></Suspense>;
  }
  if (!loadingDone) {
    const loadingScreen = site.screens.find(({ id }) => id === loading?.screenId);
    return <main aria-busy="true"><ScreenView screen={loadingScreen} mode="interact" products={site.products}
      productFields={site.productFields} design={site.designSystem} breakpoints={site.breakpoints} datasets={data.datasets} scenarios={data.scenarios} onRetryDataset={data.retry}
      screens={site.screens} startScreenId={site.startScreenId} background={site.background} elementClasses={site.elementClasses} elementSignatures={site.elementSignatures} contentMaxWidth={site.contentMaxWidth}
      assetUrls={assetUrls} onNavigate={() => {}} /></main>;
  }
  if (!screen) {
    return <main className="screen not-found">
      <h1>ページが見つかりません</h1>
      <p>URLが変わったか、ページが削除された可能性があります。</p>
      <p><a href={import.meta.env.BASE_URL}>最初のページへ</a></p>
    </main>;
  }
  return <main><ScreenView screen={screen} mode="interact" products={site.products}
    productFields={site.productFields} design={site.designSystem} breakpoints={site.breakpoints} datasets={data.datasets} scenarios={data.scenarios} onRetryDataset={data.retry}
    screens={site.screens} startScreenId={site.startScreenId} background={site.background} contentMaxWidth={site.contentMaxWidth} elementClasses={site.elementClasses} elementSignatures={site.elementSignatures} api={orderApi}
    routeRecords={route?.records} onNavigate={navigate} assetUrls={assetUrls} panelHistory basePath={localeRoot} />
    {/* 閲覧用のURL（GitHub Pages の preview）だけ、コメントを GitHub の Issue で送れる（Issue #171） */}
    {/* アクセス解析と Cookie の同意（Issue #175） */}
    <SiteServicesView services={site.services} path={location.pathname} title={title} measure={!previewRepository} />
    {previewRepository && <PreviewComments repository={previewRepository} screenId={screen.id} screenName={screen.name} base={import.meta.env.BASE_URL} />}</main>;
}

const previewRepository = typeof import.meta.env.VITE_RM_PREVIEW_REPO === 'string' && /^[\w.-]+\/[\w.-]+$/.test(import.meta.env.VITE_RM_PREVIEW_REPO) ? import.meta.env.VITE_RM_PREVIEW_REPO : '';

// フォームの送信先など、利用者のファイルから読む設定（Issue #175）
setSiteConfig({ formEndpoint: (project as { services?: { formEndpoint?: string } }).services?.formEndpoint,
  locales: (project as unknown as SiteProject).locales, locale: localeFromPath(location.pathname, import.meta.env.BASE_URL, (project as unknown as SiteProject).locales).locale, basePath: import.meta.env.BASE_URL });

const root = document.getElementById('root');
if (!root) throw new Error('サイトの表示先が見つかりません。');
createRoot(root).render(<Site />);
