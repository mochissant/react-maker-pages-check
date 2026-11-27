/**
 * データの取得先（Issue #117）。利用者（バックエンド担当）が管理するファイルです。再書き出しで上書きしません。
 * 画面は dataApi だけを呼びます。通信の詳細はこのファイルに閉じ込めます。
 * - VITE_DATA_API_URL が空：ブラウザ内のモック（src/generated/project.json のダミーデータ）。VITE_DATA_MOCK_PATTERN で 0件・失敗・遅延などを選べる
 * - VITE_DATA_API_URL を指定：本番のAPI（形は src/generated/openapi.json）。npm run mock:api のモックのサーバーにも向けられる
 */
import type { DatasetRecords } from '../generated/data-types';
import { mockDataApi } from '../data-mock';

export type DatasetKey = keyof DatasetRecords;
export type ListQuery<K extends DatasetKey> = {
  page?: number;
  pageSize?: number;
  sort?: Extract<keyof DatasetRecords[K], string>;
  order?: 'asc' | 'desc';
  filter?: Partial<Record<Extract<keyof DatasetRecords[K], string>, string | number | boolean>>;
};
export type ListResult<K extends DatasetKey> = { records: DatasetRecords[K][]; total: number };
export type DataApi = {
  list<K extends DatasetKey>(key: K, query: ListQuery<K>, signal: AbortSignal): Promise<ListResult<K>>;
  get<K extends DatasetKey>(key: K, id: string, signal: AbortSignal): Promise<DatasetRecords[K] | null>;
};

/** 本番のAPI（src/generated/openapi.json の形）。認証などはここに足す */
export function httpDataApi(base: string): DataApi {
  const root = base.replace(/\/$/, '');
  async function request<T>(path: string, signal: AbortSignal): Promise<T | null> {
    const response = await fetch(`${root}${path}`, { signal, headers: { accept: 'application/json' } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`データを取得できませんでした（${response.status}）`);
    return await response.json() as T;
  }
  return {
    async list(key, query, signal) {
      const params = new URLSearchParams();
      for (const name of ['page', 'pageSize', 'sort', 'order'] as const) if (query[name] !== undefined) params.set(name, String(query[name]));
      for (const [name, value] of Object.entries(query.filter ?? {})) if (value !== undefined) params.set(`filter[${name}]`, String(value));
      const result = await request<ListResult<typeof key>>(`/datasets/${key}?${params}`, signal);
      return result ?? { records: [], total: 0 };
    },
    get: (key, id, signal) => request(`/datasets/${key}/${encodeURIComponent(id)}`, signal),
  };
}

export const dataApi: DataApi = import.meta.env.VITE_DATA_API_URL ? httpDataApi(import.meta.env.VITE_DATA_API_URL) : mockDataApi;
