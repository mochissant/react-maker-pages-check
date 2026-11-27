// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 書き出したサイトの、部品のドキュメントのページ（Issue #180）。閲覧用のURL（preview）の design-system/ に出す。
 * 目次（design-system/）と部品ごと（design-system/<部品>/）。見本は、サイトと同じ描画（ScreenView）で描く
 */
import React, { useEffect, useState } from 'react';
import { ComponentDocs } from './ComponentDocs.tsx';
import type { ComponentDocsData, DocComponent, DocVariant, SampleOptions } from './ComponentDocs.tsx';
import { ScreenView } from './ScreenView.tsx';
import type { SiteProject } from './site-types';

type Props = {
  load: () => Promise<{ default: unknown }>;
  site: SiteProject;
  assetUrls: Record<string, string>;
  /** design-system の URL（BASE_URL を含む。末尾の / なし） */
  prefix: string;
  initialSlug: string;
};

const isDocs = (value: unknown): value is ComponentDocsData => typeof value === 'object' && value !== null && (value as { format?: unknown }).format === 'react-maker-component-docs';

export default function SiteDocs({ load, site, assetUrls, prefix, initialSlug }: Props) {
  const [docs, setDocs] = useState<ComponentDocsData | null>(null);
  const [slug, setSlug] = useState(initialSlug);
  useEffect(() => { void load().then((module) => { if (isDocs(module.default)) setDocs(module.default); }); }, [load]);
  useEffect(() => {
    const onPopState = () => setSlug(location.pathname.slice(prefix.length).replace(/^\/+|\/+$/g, ''));
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, [prefix]);
  const component = docs?.components.find((item) => item.slug === slug);
  useEffect(() => {
    if (!docs) return;
    document.title = component ? `${component.name} | ${docs.name} のデザインシステム` : `${docs.name} のデザインシステム`;
  }, [docs, component]);
  const hrefOf = (next: string) => `${prefix}/${next ? `${next}/` : ''}`;
  function renderSample(item: DocComponent, variant: DocVariant, { replay }: SampleOptions) {
    const screen = { id: `docs-${item.id}-${variant.id || 'base'}`, name: item.name, elements: [{ id: `docs-sample-${item.id}-${variant.id || 'base'}`, type: item.type, componentId: item.id, ...(variant.id ? { variantId: variant.id } : {}), style: {} }] };
    return <ScreenView key={replay} screen={screen} mode="interact" design={site.designSystem} breakpoints={site.breakpoints} datasets={site.datasets} products={site.products}
      productFields={site.productFields} screens={site.screens} elementClasses={site.elementClasses} elementSignatures={site.elementSignatures} assetUrls={assetUrls} onNavigate={() => {}} />;
  }
  if (!docs) return <main aria-busy="true" />;
  return <main className="rm-docs-page">
    <ComponentDocs docs={docs} slug={slug} hrefOf={hrefOf} renderSample={renderSample} onOpen={(next) => {
      history.pushState(null, '', hrefOf(next));
      setSlug(next);
      scrollTo(0, 0);
    }} />
  </main>;
}
