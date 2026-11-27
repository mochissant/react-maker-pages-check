// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 多言語のサイト（Issue #182）。訳は案件データに持つ。
 * - project.locales：{ base（基準言語のコード）, others: [{ code, name }] }
 * - 要素の i18n：{ [言語のコード]: { text?, alt? } }。画面の i18n：{ [言語のコード]: { name?, title?, description? } }
 * - 訳が無ければ、基準言語の文言を出す（未訳）
 * - 書き出したサイトの URL：基準言語は / のまま、ほかの言語は /en/・/en/pricing のように頭に付ける
 */
import type { ElementData, ScreenData } from './model-types.ts';

export type Locale = { code: string; name: string };
export type Locales = { base: string; baseName?: string; others: Locale[] };

export const validLocaleCode = (code: unknown): code is string => typeof code === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code);

/** 使える言語の一覧（基準言語が先頭） */
export function localeList(locales: Locales | null | undefined): Locale[] {
  if (!locales || !validLocaleCode(locales.base)) return [];
  return [{ code: locales.base, name: locales.baseName || locales.base }, ...(locales.others ?? []).filter(({ code }) => validLocaleCode(code) && code !== locales.base)];
}

/** 要素の木を、その言語の文言にする。訳の無い文言は基準言語のまま */
export function localizeElements(elements: ElementData[], locale: string | null | undefined, base: string | null | undefined): ElementData[] {
  if (!locale || locale === base) return elements;
  return elements.map((element) => {
    const entry = element.i18n?.[locale];
    const next: ElementData = entry ? { ...element, ...(typeof entry.text === 'string' && entry.text ? { text: entry.text, richText: undefined } : {}),
      ...(typeof entry.alt === 'string' && entry.alt ? { alt: entry.alt } : {}) } : element;
    return next.children ? { ...next, children: localizeElements(next.children, locale, base) } : next;
  });
}

export function localizeScreen<Screen extends Pick<ScreenData, 'name' | 'description' | 'elements' | 'i18n' | 'seo'>>(screen: Screen, locale: string | null | undefined, base: string | null | undefined): Screen {
  if (!locale || locale === base) return screen;
  const entry = screen.i18n?.[locale];
  return { ...screen, ...(entry?.name ? { name: entry.name } : {}), ...(entry?.description ? { description: entry.description } : {}),
    ...(entry?.title ? { seo: { ...screen.seo, title: entry.title } } : {}), elements: localizeElements(screen.elements, locale, base) };
}

/** 訳す文言の一覧：[{ id, field, source, translated }]。field は text・alt */
export function translatableTexts(elements: ElementData[], locale: string) {
  const rows: Array<{ id: string; field: 'text' | 'alt'; source: string; translated: string }> = [];
  (function visit(list: ElementData[]) {
    for (const element of list) {
      if (typeof element.text === 'string' && element.text.trim()) rows.push({ id: element.id, field: 'text', source: element.text, translated: element.i18n?.[locale]?.text ?? '' });
      if (element.type === 'image' && !element.decorative && typeof element.alt === 'string' && element.alt.trim()) rows.push({ id: element.id, field: 'alt', source: element.alt, translated: element.i18n?.[locale]?.alt ?? '' });
      if (element.children) visit(element.children);
    }
  })(elements);
  return rows;
}

/** URL の頭の言語：/en/pricing → { locale: 'en', path: '/pricing' }。基準言語なら locale は base */
export function localeFromPath(pathname: string, root: string, locales: Locales | null | undefined) {
  const base = locales?.base ?? null;
  for (const { code } of localeList(locales).slice(1)) {
    const prefix = `${root}${code}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return { locale: code, root: `${prefix}/` };
  }
  return { locale: base, root };
}

/** その言語の URL（基準言語はそのまま、ほかは頭に言語を付ける） */
export function localizedRoot(root: string, locale: string | null | undefined, locales: Locales | null | undefined) {
  return !locale || locale === locales?.base ? root : `${root}${locale}/`;
}
