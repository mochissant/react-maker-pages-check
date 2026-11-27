// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 書き出すサイトの画面ごとのURL（Issue #108）。
 * - 開始画面は「/」、ほかの画面は「/コード名」（code-names.ts の画面のコード名）
 * - データ詳細を置いた画面は、選んだレコードのIDをパスに含める（/event-detail/rec-1）
 * base は配信先のパス（import.meta.env.BASE_URL。既定は「/」）
 */
import { assignCodeNames } from './code-names.ts';
import type { ElementData, ProjectData } from './model-types.ts';

export type SiteRoutes = {
  pathOf: (screenId: string, records?: Record<string, string>) => string;
  resolve: (pathname: string) => { screenId: string; records: Record<string, string> } | null;
  patternOf: (screenId: string) => string;
};

export function detailDataset(elements: ElementData[]): string | null {
  for (const element of elements) {
    if (element.type === 'data-detail' && element.binding?.datasetId) return element.binding.datasetId;
    const child = element.children && detailDataset(element.children);
    if (child) return child;
  }
  return null;
}

/**
 * 行ごとのページ（Issue #245）の URL の一部：slug の項目があれば、その値（URL に使える形）。無ければ行の ID。
 * 同じ値が重なる行・空の行は、行の ID を使う（URL が1つの行に決まるように）
 */
export function recordSlugs(project: Pick<ProjectData, 'screens'> & { datasets?: ProjectData['datasets'] }): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  for (const screen of project.screens) {
    const fieldId = screen.prerender?.slugField;
    const datasetId = detailDataset(screen.elements);
    const dataset = fieldId && datasetId ? project.datasets?.find(({ id }) => id === datasetId) : undefined;
    if (!dataset || result.has(dataset.id)) continue;
    const slugs = new Map<string, string>();
    const used = new Set<string>();
    for (const record of dataset.records) {
      const raw = record.values?.[fieldId!];
      const slug = typeof raw === 'string' ? raw.normalize('NFKC').trim().toLowerCase().replace(/[\s/?#%\\]+/g, '-').replace(/^-+|-+$/g, '') : '';
      if (slug && !used.has(slug) && !dataset.records.some(({ id }) => id === slug && id !== record.id)) { slugs.set(record.id, slug); used.add(slug); }
    }
    result.set(dataset.id, slugs);
  }
  return result;
}

export function siteRoutes(input: Pick<ProjectData, 'screens' | 'startScreenId'> & { datasets?: ProjectData['datasets'] }, base = '/'): SiteRoutes {
  // 下書きの画面（Issue #173）は、サイトの URL に入れない
  const project = { ...input, screens: input.screens.filter((screen) => screen.status !== 'draft') };
  const root = base.endsWith('/') ? base : `${base}/`;
  const slugs = assignCodeNames(project.screens, 'screen');
  const details = new Map(project.screens.map((screen) => [screen.id, detailDataset(screen.elements)]));
  const slugMap = recordSlugs(project);

  function pathOf(screenId: string, records: Record<string, string> = {}) {
    if (screenId === project.startScreenId) return root;
    const slug = slugs.get(screenId);
    if (!slug) return root;
    const datasetId = details.get(screenId);
    const recordId = datasetId && records[datasetId];
    const part = recordId ? slugMap.get(datasetId)?.get(recordId) ?? recordId : '';
    return `${root}${slug}${part ? `/${encodeURIComponent(part)}` : ''}`;
  }

  /** パスから画面とレコードを決める。見つからなければ null */
  function resolve(pathname: string) {
    if (!pathname.startsWith(root) && `${pathname}/` !== root) return null;
    const rest = pathname.slice(root.length).replace(/\/+$/, '');
    if (!rest) return project.startScreenId ? { screenId: project.startScreenId, records: {} } : null;
    const [slug, recordId, ...extra] = rest.split('/');
    const screenId = [...slugs].find(([, value]) => value === slug)?.[0];
    if (!screenId || extra.length) return null;
    const datasetId = details.get(screenId);
    if (recordId && !datasetId) return null;
    if (!recordId || !datasetId) return { screenId, records: {} };
    // slug（Issue #245）でも行の ID でも開ける
    const value = decodeURIComponent(recordId);
    const bySlug = [...(slugMap.get(datasetId) ?? [])].find(([, slugValue]) => slugValue === value)?.[0];
    return { screenId, records: { [datasetId]: bySlug ?? value } };
  }

  /** 編集GUIに出すURLの形。詳細画面はレコードのIDの位置を「:id」で示す */
  function patternOf(screenId: string) {
    const path = pathOf(screenId);
    return details.get(screenId) && screenId !== project.startScreenId ? `${path}/:id` : path;
  }

  return { pathOf, resolve, patternOf };
}
