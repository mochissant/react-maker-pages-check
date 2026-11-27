// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 素材（画像・SVG）とアイコン（Issue #98）。
 * - project.assets = [{ id, name, mime, data（data URL）, width, height, bytes }]。画像要素の src は「asset:<id>」で参照する
 * - 書き出しでは public/assets/ にファイルとして出し、project.json には data を入れない（file を入れる）
 * - アイコンは lucide の形のデータ（[タグ, 属性] の並び）を要素に持ち、決まったタグと属性だけで <svg> を組み立てる（innerHTML を使わない）
 * - 持ち込みの SVG は <img> で表示する（SVG の中のスクリプトは動かない）
 */
import type { AssetData, ElementData, IconData, IconShape, ProjectData } from './model-types.ts';

export const assetPrefix = 'asset:';
/** 新しいアイコン要素の形（lucide の star。ISC License） */
export const defaultIcon: IconData = { name: 'star', node: [['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }]] };
export const largeAssetBytes = 500 * 1024;

export function assetId(src: unknown) {
  return typeof src === 'string' && src.startsWith(assetPrefix) ? src.slice(assetPrefix.length) : null;
}

/** 画像の src を、表示に使える URL にする。assetUrls は id → URL（編集GUIは data URL、書き出したサイトはファイルのパス） */
export function resolveAssetSrc(src: string | null | undefined, assetUrls?: Record<string, string | undefined>) {
  const id = assetId(src);
  return id ? assetUrls?.[id] ?? null : src;
}

export function assetFileName(asset: Pick<AssetData, 'id' | 'name' | 'mime'>) {
  const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' } as Record<string, string | undefined>)[asset.mime] ?? 'bin';
  const base = String(asset.name ?? 'image').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image';
  return `${base}-${String(asset.id).slice(0, 8)}.${extension}`;
}

/** 素材ごとの使われている数（画像要素・ボタンのアイコンを除く。共通部品の定義も数える） */
export function assetUsage(project: Pick<ProjectData, 'assets' | 'screens' | 'designSystem' | 'siteIcons'>) {
  const counts = new Map<string, number>((project.assets ?? []).map(({ id }) => [id, 0]));
  const count = (id: string | null) => { if (id && counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1); };
  count(project.siteIcons?.sourceId ?? null);
  for (const image of project.siteIcons?.images ?? []) count(image.assetId);
  const visit = (elements: ElementData[] | undefined) => {
    for (const element of elements ?? []) {
      count(assetId(element.src));
      // 部品の画像プロパティ（Issue #110）
      for (const value of Object.values(element.customValues ?? {})) {
        count(assetId(value));
      }
      for (const values of Object.values(element.childOverrides ?? {})) {
        count(assetId(values?.src));
      }
      visit(element.children);
    }
  };
  for (const screen of project.screens ?? []) visit(screen.elements);
  for (const component of project.designSystem?.components ?? []) {
    if (component.root) visit([component.root]);
    for (const variant of component.variants ?? []) for (const values of Object.values(variant.values ?? {})) {
      count(assetId(values?.src));
    }
  }
  return counts;
}

const iconTags = new Set(['path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect']);
const iconAttributes = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points']);

/** アイコンの形のデータを、決まったタグと属性だけに絞る。読めなければ null */
export function safeIconNode(node: unknown): IconShape[] | null {
  if (!Array.isArray(node)) return null;
  const shapes = node.filter((item): item is [string, Record<string, unknown>] => Array.isArray(item) && iconTags.has(item[0]) && item[1] && typeof item[1] === 'object')
    .map(([tag, attributes]): IconShape => [tag, Object.fromEntries(Object.entries(attributes)
      .filter(([name, value]) => iconAttributes.has(name) && (typeof value === 'string' || typeof value === 'number') && /^[\d\s.,a-zA-Z-]*$/.test(String(value)))) as Record<string, string | number>]);
  return shapes.length ? shapes : null;
}
