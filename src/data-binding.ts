// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * データの流し込み（Issue #160・#53）。STUDIO の CMS のリストを手本にした、繰り返しと値の割り当て。
 * - 繰り返し（element.repeat）：データ一覧の行を、絞り込み・並べ替え・件数で選び、その数だけ要素（コンテナか共通部品の配置）を並べる
 * - 値の割り当て（element.dataBind）：文言・画像・代わりの文言・リンクに、行の項目を入れる。繰り返しの外では「先頭の1件」「最新の1件」「決まった1件」
 * - 表示の形：日付・金額・数の区切り・文字数の上限。項目が空のときは、隠すか、代わりの文言
 */
import type { DataRecord, DataScenario, DatasetData, ElementData, RepeatSettings, ValueBinding, ValueFormat } from './model-types.ts';
import { recordsFor } from './data.ts';

export type DataRow = { dataset: DatasetData; record: DataRecord; index: number; parts?: ValueBinding['parts'] };
type Scenarios = Record<string, DataScenario | undefined> | undefined;

const empty = (value: unknown) => value == null || value === '' || (Array.isArray(value) && !value.length);
const comparable = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return Date.parse(value);
  return String(value ?? '');
};

function matches(record: DataRecord, filter: NonNullable<RepeatSettings['filter']>) {
  const value = record.values[filter.fieldId];
  switch (filter.op) {
    case 'empty': return empty(value);
    case 'notEmpty': return !empty(value);
    case 'contains': return Array.isArray(value) ? value.includes(String(filter.value)) : String(value ?? '').includes(String(filter.value ?? ''));
    case 'ne': return String(value ?? '') !== String(filter.value ?? '');
    case 'gt': return comparable(value) > comparable(filter.value);
    case 'lt': return comparable(value) < comparable(filter.value);
    default: return String(value ?? '') === String(filter.value ?? '');
  }
}

/** 項目の値で並べる（数・日付は値の大きさ、文字は日本語の並び。空の値はいつも最後） */
export function sortRecords(records: DataRecord[], fieldId: string, direction: 'asc' | 'desc' = 'asc'): DataRecord[] {
  return [...records].sort((a, b) => {
    const [x, y] = [a.values?.[fieldId], b.values?.[fieldId]];
    if (empty(x) || empty(y)) return empty(x) === empty(y) ? 0 : empty(x) ? 1 : -1;
    const [left, right] = [comparable(x), comparable(y)];
    const order = typeof left === 'string' || typeof right === 'string'
      ? String(left).localeCompare(String(right), 'ja', { numeric: true })
      : left < right ? -1 : left > right ? 1 : 0;
    return direction === 'desc' ? -order : order;
  });
}

/** 検索（Issue #240）：語を空白で分け、すべての語を、指定した項目のどれかが含む行（大文字・小文字と全角・半角を区別しない） */
export function searchRecords(records: DataRecord[], fieldIds: string[], query: string): DataRecord[] {
  const fold = (text: string) => text.normalize('NFKC').toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return records;
  return records.filter((record) => {
    const text = fold(fieldIds.map((id) => {
      const value = record.values?.[id];
      return Array.isArray(value) ? value.join(' ') : value == null ? '' : String(value);
    }).join('\n'));
    return words.every((word) => text.includes(word));
  });
}

/** 繰り返す行：絞り込み → 並べ替え → 先頭を飛ばす → 件数 */
export function repeatRecords(repeat: RepeatSettings, dataset: DatasetData | undefined, scenario?: DataScenario | null): DataRecord[] {
  if (!dataset) return [];
  let records = recordsFor(dataset, scenario);
  if (repeat.filter?.fieldId) records = records.filter((record) => matches(record, repeat.filter!));
  if (repeat.sort?.fieldId) records = sortRecords(records, repeat.sort.fieldId, repeat.sort.direction);
  const offset = Number.isInteger(repeat.offset) && (repeat.offset ?? 0) > 0 ? repeat.offset! : 0;
  const limit = Number.isInteger(repeat.limit) && (repeat.limit ?? 0) > 0 ? repeat.limit! : undefined;
  return records.slice(offset, limit === undefined ? undefined : offset + limit);
}

/** よく使う指定（Issue #160）：最新の1件・先頭の3件 など */
export const repeatPresets = (dateFieldId?: string): Array<{ id: string; label: string; patch: Partial<RepeatSettings> }> => [
  { id: 'all', label: 'すべて', patch: { sort: null, limit: null, offset: null } },
  { id: 'first3', label: '先頭の3件', patch: { sort: null, limit: 3, offset: null } },
  ...(dateFieldId ? [{ id: 'latest1', label: '最新の1件', patch: { sort: { fieldId: dateFieldId, direction: 'desc' as const }, limit: 1, offset: null } },
    { id: 'latest3', label: '新しい順に3件', patch: { sort: { fieldId: dateFieldId, direction: 'desc' as const }, limit: 3, offset: null } }] : []),
];

const pad = (value: number) => String(value).padStart(2, '0');
/** 表示の形 */
export function formatData(value: unknown, format?: ValueFormat | null): string {
  if (empty(value)) return '';
  if (typeof value === 'boolean') return value ? 'はい' : 'いいえ';
  if (Array.isArray(value)) return value.join('、');
  if (!format) return String(value);
  if (format.kind === 'date' || format.kind === 'dateShort' || format.kind === 'dateTime') {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    // 日付だけの値（2026-11-18）は、時差でずれないように、そのまま読む
    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    const [year, month, day] = plain ? [Number(plain[1]), Number(plain[2]), Number(plain[3])] : [date.getFullYear(), date.getMonth() + 1, date.getDate()];
    if (format.kind === 'dateShort') return `${month}/${day}`;
    if (format.kind === 'date') return `${year}年${month}月${day}日`;
    return `${year}年${month}月${day}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const number = typeof value === 'number' ? value : Number(value);
  if (format.kind === 'currency') return Number.isFinite(number) ? `¥${Math.round(number).toLocaleString('ja-JP')}` : String(value);
  if (format.kind === 'number') return Number.isFinite(number) ? number.toLocaleString('ja-JP') : String(value);
  if (format.kind === 'truncate') {
    const length = Number.isInteger(format.length) && (format.length ?? 0) > 0 ? format.length! : 40;
    const characters = [...String(value)];
    return characters.length > length ? `${characters.slice(0, length).join('')}…` : String(value);
  }
  return String(value);
}

/** 繰り返しの外で値を取り出す1件：先頭・最新（項目の新しい順）・決まった1件 */
/** selected：一覧から移ってきたときに選んだ行（データ一覧の id → 行の id）。pick が selected のときに使う（#282） */
export function pickRecord(binding: ValueBinding, datasets: DatasetData[] | undefined, scenarios?: Scenarios, selected?: Readonly<Record<string, string>>): DataRow | undefined {
  const dataset = datasets?.find(({ id }) => id === binding.datasetId);
  if (!dataset) return undefined;
  const records = recordsFor(dataset, scenarios?.[dataset.id]);
  let record: DataRecord | undefined;
  if (binding.pick === 'record') record = records.find(({ id }) => id === binding.recordId);
  else if (binding.pick === 'selected') record = records.find(({ id }) => id === selected?.[dataset.id]) ?? records[0];
  else if (binding.pick === 'latest' && binding.latestBy) record = repeatRecords({ datasetId: dataset.id, sort: { fieldId: binding.latestBy, direction: 'desc' }, limit: 1 }, dataset, scenarios?.[dataset.id])[0];
  else record = records[0];
  return record ? { dataset, record, index: 0 } : undefined;
}

/**
 * 要素に値を流し込む。返り値の hidden は「項目が空なら隠す」で隠すとき。
 * 共通部品の中の要素（partId）は、配置の割り当て（row.parts）を使う
 */
export function bindElement(element: ElementData, row: DataRow | undefined, datasets: DatasetData[] | undefined, scenarios?: Scenarios, selected?: Readonly<Record<string, string>>): { element: ElementData; hidden: boolean } {
  const own = element.dataBind;
  const binding = own ?? (element.partId && row?.parts ? row.parts[element.partId] : undefined);
  if (!binding || (!binding.text && !binding.src && !binding.alt && !binding.href)) return { element, hidden: false };
  const source = own?.datasetId && !row ? pickRecord(own, datasets, scenarios, selected) : own?.datasetId && row && own.datasetId !== row.dataset.id ? pickRecord(own, datasets, scenarios, selected) : row;
  const value = (fieldId?: string) => (fieldId && source ? source.record.values[fieldId] : undefined);
  let next: ElementData = element;
  let hidden = false;
  const fallback = (text: string) => {
    if (binding.fallback?.mode === 'hide') hidden = true;
    return binding.fallback?.mode === 'text' ? binding.fallback.text ?? '' : text;
  };
  if (binding.text) {
    const raw = value(binding.text);
    next = { ...next, richText: undefined, text: empty(raw) ? fallback('') : formatData(raw, binding.format) };
  }
  if (binding.src) {
    const raw = value(binding.src);
    if (empty(raw)) { fallback(''); next = { ...next, src: '' }; } else next = { ...next, src: String(raw) };
  }
  if (binding.alt) next = { ...next, alt: formatData(value(binding.alt)) };
  if (binding.href) {
    const raw = value(binding.href);
    if (typeof raw === 'string' && /^(https?:\/\/|\/)/.test(raw)) {
      next = { ...next, interactions: [{ id: `bind-${element.id}`, trigger: 'click', actions: [{ type: 'link', url: raw }] }] };
    }
  }
  return { element: next, hidden };
}
