// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { StatusMessages } from './model-types.ts';

export const statusLabels: Record<string, string> = { loading: '読み込み中', empty: '空', pending: '処理中', error: '失敗', success: '成功' };

export const blockStatuses: Record<string, string[]> = {
  catalog: ['loading', 'empty', 'error'], cart: ['empty'], review: ['empty'], receipt: ['empty'],
  'data-list': ['loading', 'empty', 'error'], 'data-detail': ['loading', 'empty', 'error'],
};

export function statusText(settings: StatusMessages | null | undefined, state: string, fallback: string) {
  return settings?.[state]?.text?.trim() || fallback;
}
