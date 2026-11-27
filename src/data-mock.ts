// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * ブラウザ内のモックのデータAPI（Issue #117）。react-maker が管理するファイルです。
 * src/generated/project.json のダミーデータを、API と同じ形（{ id, ...項目 }）で返す。
 * VITE_DATA_MOCK_PATTERN：empty（0件）・error（失敗）・delay（遅延）・long（長文）・missing（欠損）・many（大量）
 */
import project from './generated/project.json';
import { datasetKeys } from './generated/data-types';
import type { DatasetRecords } from './generated/data-types';
import type { DataApi } from './integrations/data-api';
import type { SiteProject } from './site-types';

export type Value = string | number | boolean | readonly string[] | null;
export type ApiRecord = { id: string } & Record<string, Value | undefined>;
export type InternalRecord = { id: string; values: Record<string, Value | undefined> };
type Keys = Record<string, { id: string; fields: Record<string, string> }>;
const keys = datasetKeys as unknown as Keys;

/** 編集GUIの形（項目 id）→ API の形（項目 key） */
export function toApi(key: string, record: InternalRecord): ApiRecord {
  const fields = keys[key]?.fields ?? {};
  return { id: record.id, ...Object.fromEntries(Object.entries(fields).filter(([, id]) => Object.hasOwn(record.values, id)).map(([name, id]) => [name, record.values[id]])) };
}

/** API の形 → 編集GUIの形 */
export function fromApi(key: string, record: ApiRecord): InternalRecord {
  const fields = keys[key]?.fields ?? {};
  return { id: String(record.id), values: Object.fromEntries(Object.entries(fields).filter(([name]) => Object.hasOwn(record, name)).map(([name, id]) => [id, record[name]])) };
}

export const pattern = import.meta.env.VITE_DATA_MOCK_PATTERN as string | undefined;
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
});

function mockRecords(key: string): ApiRecord[] {
  const dataset = (project as unknown as SiteProject).datasets.find(({ id }) => id === keys[key]?.id);
  const records = (dataset?.records ?? []).map((record) => toApi(key, record as unknown as InternalRecord));
  if (pattern === 'empty') return [];
  if (pattern === 'long') return records.map((record) => Object.fromEntries(Object.entries(record).map(([name, value]) => [name, typeof value === 'string' && name !== 'id' ? value.repeat(4) : value])) as ApiRecord);
  if (pattern === 'missing') return records.map((record, index) => (index === 0 ? { id: record.id } : record));
  if (pattern === 'many') return Array.from({ length: 1000 }, (_, index) => ({ ...records[index % Math.max(records.length, 1)], id: `mock-${index + 1}` }));
  return records;
}

/** ブラウザ内のモック。VITE_DATA_MOCK_PATTERN：empty（0件）・error（失敗）・delay（遅延）・long（長文）・missing（欠損）・many（大量） */
export const mockDataApi: DataApi = {
  async list(key, query, signal) {
    await wait(pattern === 'delay' ? 2000 : 150, signal);
    if (pattern === 'error') throw new Error('模擬の失敗です（VITE_DATA_MOCK_PATTERN=error）');
    let records = mockRecords(key);
    for (const [name, value] of Object.entries(query.filter ?? {})) records = records.filter((record) => String(record[name]) === String(value));
    if (query.sort) {
      const sort = query.sort;
      const direction = query.order === 'desc' ? -1 : 1;
      records = [...records].sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), 'ja', { numeric: true }) * direction);
    }
    const size = query.pageSize ?? 30;
    const page = Math.max(1, query.page ?? 1);
    return { records: records.slice((page - 1) * size, page * size) as unknown as DatasetRecords[typeof key][], total: records.length };
  },
  async get(key, id, signal) {
    await wait(pattern === 'delay' ? 2000 : 100, signal);
    if (pattern === 'error') throw new Error('模擬の失敗です（VITE_DATA_MOCK_PATTERN=error）');
    return (mockRecords(key).find((record) => record.id === id) ?? null) as unknown as DatasetRecords[typeof key] | null;
  },
};

