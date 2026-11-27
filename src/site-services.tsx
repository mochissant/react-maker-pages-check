// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * LP の運用に要るもの（Issue #175）。書き出す共有ランタイム。設定は project.services（編集GUIのプロジェクト設定）。
 * - アクセス解析：Google Analytics 4。同意するまでは GA4 を読み込まない（Google の同意モードの既定を「拒否」にしてから読み込む）
 * - 画面の切り替え（クライアント側の遷移）も、ページビューとして送る
 * - Cookie の同意のバナー：GA4 を使うときだけ出す。決めたあとも「Cookie の設定」から変えられる
 * フォームの送信先は、利用者のファイル src/integrations/form-api.ts（既定は project.services.formEndpoint へ送る）
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

/** Cookie を使わないアクセス解析（Issue #246）。Umami（Cloud の Hobby は無料・自前の配信も無料）と GoatCounter（妥当な使い方なら無料） */
export type CookielessAnalytics = { provider: 'umami'; scriptUrl: string; websiteId: string } | { provider: 'goatcounter'; endpoint: string };
export type SiteServices = { ga4?: string; formEndpoint?: string; privacyUrl?: string; consentText?: string; analytics?: CookielessAnalytics | null };

const consentKey = 'rm-analytics-consent';
type Consent = 'granted' | 'denied' | null;
type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

export const validMeasurementId = (id: unknown): id is string => typeof id === 'string' && /^G-[A-Z0-9]{4,20}$/.test(id);
const httpsUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || /[\s"<>]/.test(value)) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};
/** GoatCounter のコード（「mysite」）か、送り先の URL（https://mysite.goatcounter.com/count）を、送り先の URL にする */
export const goatcounterEndpoint = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/^[a-z0-9][a-z0-9-]{1,62}$/i.test(text)) return `https://${text.toLowerCase()}.goatcounter.com/count`;
  return httpsUrl(text) && /\/count$/.test(new URL(text).pathname) ? text : null;
};
/** 使える設定か（足りない・誤った設定では、スクリプトを読み込まない） */
export function validAnalytics(value: unknown): value is CookielessAnalytics {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  if (entry.provider === 'umami') return httpsUrl(entry.scriptUrl) && typeof entry.websiteId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.websiteId);
  if (entry.provider === 'goatcounter') return goatcounterEndpoint(entry.endpoint) !== null;
  return false;
}

type AnalyticsWindow = Window & {
  umami?: { track: (payload?: (props: Record<string, unknown>) => Record<string, unknown>) => void };
  goatcounter?: { no_onload?: boolean; count?: (vars: { path: string }) => void };
};
const analyticsLoads = new Map<string, Promise<void>>();
/**
 * 解析のスクリプトを1回だけ読み込む。自動の計測は止めて（Umami：data-auto-track="false"、GoatCounter：no_onload）、
 * 画面の切り替えのたびに、こちらから1回だけページビューを送る（二重に数えない）
 */
function loadCookieless(config: CookielessAnalytics): Promise<void> {
  const key = JSON.stringify(config);
  const loaded = analyticsLoads.get(key);
  if (loaded) return loaded;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.rmAnalytics = config.provider;
    if (config.provider === 'umami') {
      script.src = config.scriptUrl;
      script.dataset.websiteId = config.websiteId;
      script.dataset.autoTrack = 'false';
    } else {
      const view = window as AnalyticsWindow;
      view.goatcounter = { ...view.goatcounter, no_onload: true };
      script.src = 'https://gc.zgo.at/count.js';
      script.dataset.goatcounter = goatcounterEndpoint(config.endpoint) ?? '';
    }
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('アクセス解析のスクリプトを読み込めませんでした。')), { once: true });
    document.head.append(script);
  });
  analyticsLoads.set(key, promise);
  return promise;
}
function sendCookielessPageView(config: CookielessAnalytics, path: string, title: string) {
  const view = window as AnalyticsWindow;
  if (config.provider === 'umami') view.umami?.track((props) => ({ ...props, url: path, title }));
  else view.goatcounter?.count?.({ path });
}

/** Cookie を使わない解析：同意のバナーは出さない。path が変わるたびに1回だけ送る */
function CookielessView({ config, path, title }: { config: CookielessAnalytics; path: string; title: string }) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    loadCookieless(config).then(() => {
      if (!active || sent.current === path) return;
      sent.current = path;
      sendCookielessPageView(config, path, title);
    }).catch(() => { /* 広告ブロックなどで読み込めなくても、サイトは使える */ });
    return () => { active = false; };
  }, [config, path, title]);
  return null;
}

function readConsent(): Consent {
  try { const value = localStorage.getItem(consentKey); return value === 'granted' || value === 'denied' ? value : null; } catch { return null; }
}

/** GA4 を読み込む（同意したときだけ）。同意モードの既定は「拒否」、同意で「許可」に変える */
function loadAnalytics(id: string) {
  const view = window as GtagWindow;
  if (view.gtag) return;
  view.dataLayer = view.dataLayer ?? [];
  // gtag.js が読む形（arguments のまま積む）
  view.gtag = function gtag() { view.dataLayer?.push(arguments); }; // eslint-disable-line prefer-rest-params
  view.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  view.gtag('consent', 'update', { analytics_storage: 'granted' });
  view.gtag('js', new Date());
  view.gtag('config', id, { send_page_view: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
}

/** ページビュー（画面の切り替えのたび） */
export function trackPageView(path: string, title: string) {
  (window as GtagWindow).gtag?.('event', 'page_view', { page_path: path, page_location: location.href, page_title: title });
}

/**
 * 同意のバナーと、解析の読み込み。path・title が変わるたびにページビューを送る。
 * measure が false（閲覧用のURLの版など、本番でない配信）では、どの解析も読み込まず、送らない
 */
export function SiteServicesView({ services, path, title, measure = true }: { services?: SiteServices | null; path: string; title: string; measure?: boolean }) {
  const analyticsKey = JSON.stringify(services?.analytics ?? null);
  const cookieless = useMemo(() => {
    const analytics: unknown = services?.analytics;
    return measure && validAnalytics(analytics) ? analytics : null;
  }, [measure, analyticsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    {cookieless && <CookielessView config={cookieless} path={path} title={title} />}
    {measure && <Ga4View services={services} path={path} title={title} />}
  </>;
}

function Ga4View({ services, path, title }: { services?: SiteServices | null; path: string; title: string }) {
  const id = validMeasurementId(services?.ga4) ? services.ga4 : null;
  const [consent, setConsent] = useState<Consent>(() => (id ? readConsent() : null));
  const [open, setOpen] = useState(false);
  useEffect(() => { if (id && consent === 'granted') loadAnalytics(id); }, [id, consent]);
  useEffect(() => { if (id && consent === 'granted') trackPageView(path, title); }, [id, consent, path, title]);
  if (!id) return null;
  const choose = (value: 'granted' | 'denied') => {
    try { localStorage.setItem(consentKey, value); } catch { /* このページの間だけ */ }
    // 同意を取り消したときは、読み込んだ解析を止めるため読み込み直す
    if (value === 'denied' && consent === 'granted') { location.reload(); return; }
    setConsent(value);
    setOpen(false);
  };
  return <>
    {(consent === null || open) && <section className="rm-consent" role="region" aria-label="Cookie の同意">
      <p>{services?.consentText || 'このサイトは、使われ方を知るためにアクセス解析（Google Analytics）を使い、Cookie を保存します。同意しない場合は計測しません。'}
        {services?.privacyUrl && <> <a href={services.privacyUrl}>プライバシーポリシー</a></>}</p>
      <div className="rm-consent-actions">
        <button type="button" onClick={() => choose('denied')}>同意しない</button>
        <button type="button" data-primary="" onClick={() => choose('granted')}>同意する</button>
      </div>
    </section>}
    {consent !== null && !open && <button type="button" className="rm-consent-reopen" onClick={() => setOpen(true)}>Cookie の設定</button>}
  </>;
}
