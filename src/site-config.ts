// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 書き出したサイトの設定のうち、利用者のファイル（src/integrations/*）から読むもの（Issue #175）。
 * site.tsx が起動時に project.services を入れる。編集GUIのプレビューでは空（フォームは模擬の送信になる）
 */
export type SiteConfig = {
  formEndpoint?: string;
  /** 多言語（Issue #182）：言語の一覧、いまの言語、サイトの URL の頭（BASE_URL） */
  locales?: { base: string; baseName?: string; others: Array<{ code: string; name: string }> } | null;
  locale?: string | null;
  basePath?: string;
};

let config: SiteConfig = {};
export const setSiteConfig = (next: SiteConfig | null | undefined) => { config = { ...next }; };
export const siteConfig = (): SiteConfig => config;
