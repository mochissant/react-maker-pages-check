// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import React, { useId, useState, type CSSProperties } from 'react';
import { formatValue } from './data.ts';
import { formatData, searchRecords, sortRecords } from './data-binding.ts';
import { MarkdownView } from './MarkdownView.tsx';
import { StatusMessage } from './StatusMessage.tsx';
import type { DataBinding, DataField, DataListView, DataRecord, DatasetData, ElementData, StatusMessages, ValueFormat } from './model-types.ts';

const defaultPageSize = 30;
/** 1ページの件数（Issue #240）。1〜100。未設定は30 */
export const listPageSize = (view?: DataListView | null) => Number.isInteger(view?.pageSize) && view!.pageSize! >= 1 && view!.pageSize! <= 100 ? view!.pageSize! : defaultPageSize;
/** 値を表示の形に合わせて文字にする（形の指定が無ければ従来どおり） */
const formatted = (value: unknown, format: ValueFormat | undefined, fallback: string) => format ? formatData(value, format) || fallback : formatValue(value, fallback);

/**
 * データの画像（Issue #67）。寸法が分からないので、枠の縦横比（16:9）で表示領域を先に確保する。
 * 一覧の先頭と詳細の画像は優先して読み込む（fetchpriority=high）。一覧の最初の3件は最初の表示範囲に入りやすいので
 * 遅延させずに読み込み、ほかは遅延読み込み
 */
/** 一覧と詳細で画像をつなげる名前（view-transition-name。Issue #120）。CSS の名前に使える文字だけにする */
export const sharedImageName = (recordId: string) => `rm-record-${String(recordId).replace(/[^A-Za-z0-9_-]/g, '_')}`;

function RecordImage({ url, priority = false, eager = false, shareName }: { url: string; priority?: boolean; eager?: boolean; shareName?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <img src={url} alt="" className="record-image" decoding="async" loading={priority || eager ? 'eager' : 'lazy'}
    style={shareName ? { viewTransitionName: shareName } as CSSProperties : undefined}
    {...(priority ? { fetchPriority: 'high' as const } : {})} onError={() => setFailed(true)} />;
}

const missing = (value: unknown) => value == null || value === '' || (Array.isArray(value) && !value.length);

/** 値がないときの表示（Issue #101）：隠す・代わりの文言。未設定なら従来の既定の文言 */
function fallbackOf<Fallback extends string | null>(binding: DataBinding, fieldId: string | undefined, fallback: Fallback): string | Fallback | null {
  const setting = fieldId ? binding.fallbacks?.[fieldId] : undefined;
  if (setting?.mode === 'hide') return null;
  if (setting?.mode === 'text') return setting.text ?? '';
  return fallback;
}

type RecordContentProps = { record: DataRecord; dataset: DatasetData; binding: DataBinding; priority?: boolean; eager?: boolean; share?: boolean; formats?: DataListView['formats'] };

function RecordContent({ record, dataset, binding, priority = false, eager = false, share = false, formats }: RecordContentProps) {
  const values = record.values ?? {};
  const image = binding.image ? values[binding.image] : undefined;
  const imageFallback = binding.image && missing(image) ? fallbackOf(binding, binding.image, null) : null;
  const title = binding.title && !missing(values[binding.title]) ? formatValue(values[binding.title]) : fallbackOf(binding, binding.title, '名称未設定');
  return <>
    {typeof image === 'string' && image ? <RecordImage key={image} url={image} priority={priority} eager={eager} shareName={share ? sharedImageName(record.id) : undefined} /> : imageFallback && <p className="record-image-fallback">{imageFallback}</p>}
    {title !== null && <h2>{title}</h2>}
    <dl className="product-details">
      {dataset.fields.filter(({ id }) => binding.fields?.includes(id)).map(({ id, label, type, newTab }) => {
        // リッチテキスト（Markdown）は、見出し・リンク・リストとして描く（Issue #164）
        if (type === 'richText' && !missing(values[id])) return <div key={id}><dt>{label}</dt><dd><MarkdownView source={values[id]} newTab={Boolean(newTab)} /></dd></div>;
        const text = missing(values[id]) ? fallbackOf(binding, id, '未設定') : formatted(values[id], formats?.[id], '未設定');
        return text === null ? null : <div key={id}><dt>{label}</dt><dd>{text}</dd></div>;
      })}
    </dl>
  </>;
}

/**
 * 読み込み中のスケルトン（Issue #136）。表示の設定（画像・タイトル・項目）から、中身の形をした枠を作る。
 * きらめき（shimmer）は動きを減らす設定で止まる（preview.css）。読み込み中であることは、見えない文言で伝える
 */
function Skeleton({ element, binding, settings }: { element: ElementData; binding: DataBinding; settings?: StatusMessages }) {
  const loading = element.loadingView ?? {};
  const count = element.type === 'data-detail' ? 1 : Math.min(6, Math.max(1, loading.count ?? 3));
  const style = { '--skeleton-color': loading.color || undefined, '--skeleton-radius': typeof loading.radius === 'number' && Number.isFinite(loading.radius) ? `${loading.radius}px` : undefined } as CSSProperties;
  const card = (key: number) => <li key={key} className="product-card skeleton-card" aria-hidden="true">
    {binding.image && <span className="skeleton skeleton-image" />}
    <span className="skeleton skeleton-title" />
    {(binding.fields ?? []).map((field) => <span key={field} className="skeleton skeleton-line" />)}
  </li>;
  return <div className="skeleton-block" data-shimmer={loading.shimmer === false ? undefined : ''} style={style}>
    <p className="visually-hidden" role="status">{settings?.loading?.message?.trim() || 'データを読み込み中…'}</p>
    <ul className="order-list">{Array.from({ length: count }, (_, index) => card(index))}</ul>
  </div>;
}

export type DataBlockProps = {
  element: ElementData;
  dataset: DatasetData | undefined;
  records: DataRecord[];
  selection?: string;
  editing: boolean;
  inspect?: boolean;
  /** データの状態（読み込み中・失敗。Issue #117）。それ以外は表示に関係しない */
  scenario?: string;
  onRetry?: () => void;
  onSelectRecord: (recordId: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  shareImages?: boolean;
};

const directionLabels = { asc: '昇順', desc: '降順' } as const;
/** 日時は「新しい順・古い順」と言う（#232） */
const directionLabel = (field: DataField | undefined, direction: 'asc' | 'desc') => field?.type === 'datetime' ? (direction === 'desc' ? '新しい順' : '古い順') : directionLabels[direction];
type SortState = { fieldId: string; direction: 'asc' | 'desc' } | null;

/** 表のセル（Issue #240）：画像は小さく、リッチテキストは Markdown、ほかは表示の形に合わせた文字 */
function cellContent(field: DataField, record: DataRecord, binding: DataBinding, format: ValueFormat | undefined, eager = false) {
  const value = record.values?.[field.id];
  if (missing(value)) return fallbackOf(binding, field.id, '—') ?? '';
  if (field.type === 'image' && typeof value === 'string') return <img src={value} alt="" width={48} height={48} loading={eager ? 'eager' : 'lazy'} decoding="async" className="data-table-image" />;
  if (field.type === 'richText') return <MarkdownView source={value} newTab={Boolean(field.newTab)} />;
  return formatted(value, format, '—');
}

export function DataBlock({ element, dataset, records, selection, editing, inspect, scenario, onRetry, onSelectRecord, page, onPageChange, shareImages = false }: DataBlockProps) {
  const view: DataListView = element.listView ?? {};
  const [query, setQuery] = useState('');
  const [sortChoice, setSortChoice] = useState<SortState | undefined>(undefined);
  const captionId = useId();
  if (!dataset) return editing ? <p>設定からデータを選択してください。</p> : null;
  const binding: DataBinding = element.binding ?? {};
  const settings = element.statusMessages;
  if (scenario === 'loading' && element.loadingView?.mode === 'skeleton') return <Skeleton element={element} binding={binding} settings={settings} />;
  if (scenario === 'loading' && element.loadingView?.mode === 'spinner') return <div className="loading-center">
    <span className="rm-spinner" aria-hidden="true" /><StatusMessage state="loading" settings={settings} fallback="データを読み込み中…" /></div>;
  if (scenario === 'loading' || scenario === 'error') return <StatusMessage state={scenario} settings={settings}
    fallback={scenario === 'loading' ? 'データを読み込み中…' : 'データを読み込めませんでした。'} onRetry={editing ? undefined : onRetry} />;
  if (element.type === 'data-detail') {
    const record = records.find(({ id }) => id === selection) ?? (editing ? records[0] : undefined);
    return record ? <article className="product-card" data-preview-record={inspect ? record.id : undefined}>
      <RecordContent record={record} dataset={dataset} binding={binding} priority share={shareImages && !editing} />
    </article>
      : <StatusMessage state="empty" settings={settings} fallback="表示するレコードが選択されていません。" />;
  }
  if (!records.length) return <StatusMessage state="empty" settings={settings} fallback="データがありません（0件）。" />;

  // 検索・並べ替え（Issue #240）：検索は表示している項目（タイトルを含む）から探す。並べ替えは、選べる項目のうち存在するもの
  const fieldsById = new Map(dataset.fields.map((field) => [field.id, field]));
  const shown = dataset.fields.filter(({ id, type }) => binding.fields?.includes(id) && type !== 'image');
  const sortable = (view.sortable ?? []).filter((id) => fieldsById.has(id));
  const initialSort = view.sort?.fieldId && fieldsById.has(view.sort.fieldId) ? view.sort : null;
  const sort = sortChoice === undefined ? initialSort : sortChoice;
  const searchable = [binding.title, ...(binding.fields ?? [])].filter((id): id is string => Boolean(id && fieldsById.has(id)));
  let rows = view.search ? searchRecords(records, searchable, query) : records;
  if (sort) rows = sortRecords(rows, sort.fieldId, sort.direction);
  const size = listPageSize(view);
  // この件数だけ出す（ページ送りなし。お知らせの新しい3件など。#232）
  if (view.limit) rows = rows.slice(0, size);
  const lastPage = Math.max(0, Math.ceil(rows.length / size) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * size;
  const visible = rows.slice(start, start + size);
  const changeSort = (next: SortState) => { if (editing) return; setSortChoice(next); onPageChange(0); };
  const sortText = sort ? `・${fieldsById.get(sort.fieldId)?.label ?? ''}の${directionLabel(fieldsById.get(sort.fieldId), sort.direction)}` : '';
  const searching = view.search && query.trim();
  const status = rows.length
    ? `${searching ? `「${query.trim()}」に合う ` : ''}${rows.length}件中 ${start + 1}〜${Math.min(start + size, rows.length)}件${sortText}`
    : `「${query.trim()}」に合う行はありません。`;
  const detailButton = (record: DataRecord) => element.targetScreenId && <button type="button" data-record-link="" onClick={() => {
    if (!editing) onSelectRecord(record.id);
  }}>詳細を見る<span className="visually-hidden"> {formatValue(binding.title ? record.values?.[binding.title] : undefined, '名称未設定')}</span></button>;
  const table = view.layout === 'table';

  return <>
    {(view.search || (!table && sortable.length > 0)) && <div className="data-controls">
      {view.search && <div role="search" className="data-search"><label>{dataset.name}を検索
        <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); if (!editing) onPageChange(0); }} /></label></div>}
      {!table && sortable.length > 0 && <label className="data-sort">並べ替え
        <select value={sort ? `${sort.fieldId}:${sort.direction}` : ''} onChange={(event) => {
          const [fieldId, direction] = event.target.value.split(':');
          changeSort(fieldId ? { fieldId, direction: direction === 'desc' ? 'desc' : 'asc' } : null);
        }}>
          <option value="">設定の順</option>
          {sortable.flatMap((id) => (['asc', 'desc'] as const).map((direction) => <option key={`${id}:${direction}`} value={`${id}:${direction}`}>
            {fieldsById.get(id)?.label}（{directionLabel(fieldsById.get(id), direction)}）</option>))}
        </select></label>}
    </div>}
    {(!view.limit || view.search || sortable.length > 0) && <p role="status" data-preview-page={inspect ? currentPage + 1 : undefined} data-preview-count={inspect ? records.length : undefined}>{status}</p>}
    {table ? visible.length > 0 && <div className="data-table-scroll" role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className="data-table" data-striped={view.striped ? '' : undefined} data-density={view.density && view.density !== 'normal' ? view.density : undefined}>
        <caption id={captionId}>{view.caption?.trim() || dataset.name}</caption>
        <thead><tr>
          {[binding.title, binding.image, ...shown.filter(({ id }) => id !== binding.title).map(({ id }) => id)].filter((id): id is string => Boolean(id && fieldsById.has(id))).map((id) => {
            const field = fieldsById.get(id)!;
            const current = sort?.fieldId === id ? sort.direction : undefined;
            return <th key={id} scope="col" aria-sort={current === 'asc' ? 'ascending' : current === 'desc' ? 'descending' : undefined}>
              {sortable.includes(id) ? <button type="button" className="data-sort-button" onClick={() => changeSort({ fieldId: id, direction: current === 'asc' ? 'desc' : 'asc' })}>
                {field.label}<span aria-hidden="true" className="data-sort-mark">{current === 'asc' ? '▲' : current === 'desc' ? '▼' : '↕'}</span></button> : field.label}
            </th>;
          })}
          {element.targetScreenId && <th scope="col"><span className="visually-hidden">操作</span></th>}
        </tr></thead>
        <tbody>{visible.map((record, index) => <tr key={record.id} data-record-selected={selection === record.id || undefined}>
          {binding.title && fieldsById.has(binding.title) && <th scope="row">{cellContent(fieldsById.get(binding.title)!, record, binding, view.formats?.[binding.title])}</th>}
          {binding.image && fieldsById.has(binding.image) && <td>{cellContent(fieldsById.get(binding.image)!, record, binding, undefined, index < 3 && currentPage === 0)}</td>}
          {shown.filter(({ id }) => id !== binding.title).map((field) => <td key={field.id} data-type={field.type}>{cellContent(field, record, binding, view.formats?.[field.id])}</td>)}
          {element.targetScreenId && <td>{detailButton(record)}</td>}
        </tr>)}</tbody>
      </table>
    </div> : <ul className="order-list">
      {visible.map((record, index) => <li key={record.id}
        className="product-card" data-record-selected={selection === record.id || undefined}>
        <RecordContent record={record} dataset={dataset} binding={binding} priority={index === 0 && currentPage === 0} share={shareImages && !editing}
          eager={index < 3 && currentPage === 0} formats={view.formats} />
        {selection === record.id && <small>選択中</small>}
        {detailButton(record)}
      </li>)}
    </ul>}
    {lastPage > 0 && <nav className="data-pagination" aria-label={`${dataset.name}のページ`}>
      <button type="button" disabled={currentPage === 0} onClick={() => { if (!editing) onPageChange(currentPage - 1); }}>前のページ</button>
      <span>{currentPage + 1} / {lastPage + 1}</span>
      <button type="button" disabled={currentPage === lastPage} onClick={() => { if (!editing) onPageChange(currentPage + 1); }}>次のページ</button>
    </nav>}
  </>;
}
