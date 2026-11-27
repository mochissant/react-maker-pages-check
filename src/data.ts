// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { DataField, DataRecord, DataScenario, DatasetData, DataValue, ProductData } from './model-types.ts';
import type { projectCodeNames } from './code-names.ts';

export const fieldTypes = ['text', 'richText', 'number', 'boolean', 'select', 'datetime', 'image', 'tags'];

/** プレビューのデータ条件を、画面の描画と計算値の確認で同じように使う。 */
export function datasetsForScenario(datasets: DatasetData[], scenarios: Record<string, DataScenario | undefined> = {}): DatasetData[] {
  return datasets.map((dataset) => {
    const scenario = scenarios[dataset.id];
    const unavailable = scenario?.kind === 'loading' || scenario?.kind === 'error';
    const records = unavailable ? [] : recordsFor(dataset, scenario);
    return { ...dataset, records, status: unavailable ? scenario.kind : records.length ? 'ready' : 'empty' };
  });
}

/** 読み込んだデータの検査。形の分からない値を受け取り、正しければ何もしない */
export function validateDataset(fields: unknown, records: unknown): asserts fields is DataField[] {
  const validId = (id: unknown) => typeof id === 'string' && /^[\w-]+$/.test(id);
  if (!Array.isArray(fields) || !fields.length || fields.some((field: DataField | null) => !field ||
    !validId(field.id) || typeof field.label !== 'string' || !field.label.trim() ||
    !fieldTypes.includes(field.type) || (field.type === 'select' &&
      (!Array.isArray(field.options) || !field.options.length || field.options.some((item: unknown) => typeof item !== 'string'))))
    || new Set(fields.map(({ id }: DataField) => id)).size !== fields.length) {
    throw new Error('項目には重複しない半角ID、ラベル、対応する型を指定してください。selectには選択肢が必要です。');
  }
  if (!Array.isArray(records) || records.some((record: DataRecord | null) => !record || !validId(record.id) ||
    !record.values || typeof record.values !== 'object' || Array.isArray(record.values)) ||
    new Set(records.map(({ id }: DataRecord) => id)).size !== records.length) {
    throw new Error('レコードには重複しない半角IDとvaluesオブジェクトを指定してください。');
  }
  const byId = new Map((fields as DataField[]).map((field) => [field.id, field]));
  for (const { id, values } of records as DataRecord[]) {
    for (const [key, value] of Object.entries(values)) {
      const field = byId.get(key);
      if (!field || !isDatasetFieldValue(field, value)) {
        throw new Error(`レコード「${id}」の「${key}」の項目名と型を確認してください。`);
      }
    }
  }
}

export function isDatasetFieldValue(field: Pick<DataField, 'type' | 'options'>, value: unknown) {
  if (value == null) return true;
  switch (field.type) {
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'tags': return Array.isArray(value) && value.every((tag) => typeof tag === 'string');
    case 'select': return value === '' || (typeof value === 'string' && Boolean(field.options?.includes(value)));
    default: return typeof value === 'string';
  }
}

/** 長文のプレビューで足す文。日本語の長い文と、途中で折り返せない英数字の列を含む */
export const longTextSuffix = '。長い文言で折り返しと省略を確認するための文章です。複数行にわたる場合の行間と余白も確認します。'
  + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const lengthen = (value: unknown) => `${value ?? ''}${longTextSuffix}`;

/** 項目の型ごとの「空の値」（空文字・0・false・空のタグ） */
export function emptyValue(field: Pick<DataField, 'type'>): DataValue {
  return ({ number: 0, boolean: false, tags: [] } as Record<string, DataValue>)[field.type] ?? '';
}

/** 先頭レコードの1項目を変えるパターン（項目を選ぶ） */
export const fieldScenarioKinds = ['null', 'missing', 'emptyValue'];

export function recordsFor(dataset: Pick<DatasetData, 'fields' | 'records'> | null | undefined, scenario?: DataScenario | null): DataRecord[] {
  const records = dataset?.records ?? [];
  if (scenario?.kind === 'empty') return [];
  if (scenario && fieldScenarioKinds.includes(scenario.kind)) {
    const field = dataset?.fields.find(({ id }) => id === scenario.fieldId) ?? dataset?.fields[0];
    if (!field) return records;
    return records.map((record, index) => {
      if (index !== 0) return record;
      if (scenario.kind === 'missing') {
        const { [field.id]: _removed, ...values } = record.values;
        return { ...record, values };
      }
      return { ...record, values: { ...record.values, [field.id]: scenario.kind === 'null' ? null : emptyValue(field) } };
    });
  }
  if (scenario?.kind === 'longText') {
    const texts = (dataset?.fields ?? []).filter(({ type }) => type === 'text' || type === 'richText' || type === 'tags');
    return records.map((record) => ({ ...record, values: { ...record.values, ...Object.fromEntries(texts
      .filter(({ id }) => record.values[id] != null)
      .map(({ id, type }) => [id, type === 'tags' && Array.isArray(record.values[id]) ? [...record.values[id], lengthen('タグ')] : lengthen(record.values[id])])) } }));
  }
  if (scenario?.kind === 'noImage') {
    const images = (dataset?.fields ?? []).filter(({ type }) => type === 'image');
    return records.map((record) => ({ ...record, values: { ...record.values, ...Object.fromEntries(images.map(({ id }) => [id, null])) } }));
  }
  if (scenario?.kind === 'many' && records.length) {
    const count = Math.max(1, Math.min(5000, Math.trunc(scenario.count ?? 0) || 1000));
    return Array.from({ length: count }, (_, index) => ({
      ...records[index % records.length], id: `preview-${index + 1}`,
    }));
  }
  return records;
}

/** 注文の商品取得のプレビュー条件（長文・画像なし）を商品に当てる。それ以外は元の配列を返す */
export function productsFor(products: ProductData[], productFields: Array<Pick<DataField, 'id' | 'type'>> = [], kind?: string): ProductData[] {
  if (kind === 'longText') {
    const texts = productFields.filter(({ type }) => type === 'text');
    return products.map((product) => ({ ...product, name: lengthen(product.name), values: { ...product.values, ...Object.fromEntries(texts
      .filter(({ id }) => product.values?.[id] != null).map(({ id }) => [id, lengthen(product.values?.[id])])) } }));
  }
  if (kind === 'noImage') {
    const images = productFields.filter(({ type }) => type === 'image');
    return products.map((product) => ({ ...product, image: null,
      values: { ...product.values, ...Object.fromEntries(images.map(({ id }) => [id, null])) } }));
  }
  return products;
}

export function formatValue(value: unknown, fallback = '') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'はい' : 'いいえ';
  return Array.isArray(value) ? value.join('、') || fallback : String(value);
}

/**
 * 項目の必須・任意と制約（Issue #101）。既存の項目は任意で、欠け方もすべて許す（表示を変えない）。
 * field.required：必須。field.allow = { null, absent, empty }：任意の項目で許す欠け方（未指定は許す）。
 * field.maxLength（文字）・field.min / field.max（数値）・field.minDate / field.maxDate（日時）
 */
const missingKinds: Record<string, 'null' | 'absent' | 'empty'> = { null: 'null', missing: 'absent', emptyValue: 'empty' };

/** プレビュー条件（null・項目なし・空の値）を、この項目に当てられるか */
export function allowsMissing(field: DataField | null | undefined, kind: string) {
  if (!field || field.required) return false;
  return field.allow?.[missingKinds[kind]] !== false;
}

function isEmpty(field: Pick<DataField, 'type'>, value: unknown) {
  return value === '' || (Array.isArray(value) && !value.length) || (field.type === 'boolean' ? false : value === undefined);
}

/** 1レコードの問題（必須の値が抜けている・許していない欠け方・制約の外）。[{ fieldId, message }] */
export function recordProblems(fields: DataField[], record: Partial<DataRecord> | null | undefined) {
  const problems: Array<{ fieldId: string; message: string }> = [];
  const values: DataRecord['values'] = record?.values ?? {};
  for (const field of fields) {
    const present = Object.hasOwn(values, field.id);
    const value = values[field.id];
    const label = field.label || '名前のない項目';
    if (field.required) {
      if (!present || value == null || isEmpty(field, value)) {
        problems.push({ fieldId: field.id, message: `「${label}」は必須です。値を入れてください。` });
        continue;
      }
    } else if (!present && field.allow?.absent === false) problems.push({ fieldId: field.id, message: `「${label}」は、項目がないことを許していません。` });
    else if (present && value === null && field.allow?.null === false) problems.push({ fieldId: field.id, message: `「${label}」は、null を許していません。` });
    else if (present && value != null && isEmpty(field, value) && field.allow?.empty === false) problems.push({ fieldId: field.id, message: `「${label}」は、空の値を許していません。` });
    if (value == null || isEmpty(field, value)) continue;
    if (typeof field.maxLength === 'number' && Number.isInteger(field.maxLength) && typeof value === 'string' && [...value].length > field.maxLength) {
      problems.push({ fieldId: field.id, message: `「${label}」は${field.maxLength}文字までです。` });
    }
    if (field.type === 'number' && typeof value === 'number' && ((typeof field.min === 'number' && Number.isFinite(field.min) && value < field.min) || (typeof field.max === 'number' && Number.isFinite(field.max) && value > field.max))) {
      problems.push({ fieldId: field.id, message: `「${label}」は${field.min ?? '−∞'}〜${field.max ?? '∞'}の範囲です。` });
    }
    if (field.type === 'datetime' && typeof value === 'string') {
      const time = Date.parse(value);
      if ((field.minDate && time < Date.parse(field.minDate)) || (field.maxDate && time > Date.parse(field.maxDate))) {
        problems.push({ fieldId: field.id, message: `「${label}」は${field.minDate ?? ''}〜${field.maxDate ?? ''}の範囲です。` });
      }
    }
  }
  return problems;
}

/** 書き出す TypeScript の型（必須は string、任意は欠け方に合わせて ? や | null）。names は projectCodeNames の結果 */
export function datasetTypes(datasets: DatasetData[] = [], names: Pick<ReturnType<typeof projectCodeNames>, 'datasets' | 'fields'>) {
  const base: Record<string, string> = { text: 'string', richText: 'Markdown', number: 'number', boolean: 'boolean', select: 'string', datetime: 'string', image: 'string', tags: 'string[]' };
  // リッチテキストは、ただの文字列ではなく Markdown であることが分かる型にする（Issue #164）
  const markdown = datasets.some(({ fields }) => fields.some(({ type }) => type === 'richText'))
    ? '/** Markdown の文字列（CommonMark のうち、見出し・段落・リスト・引用・太字・斜体・取り消し線・リンク。HTML の直接の記述は描かない） */\nexport type Markdown = string;\n\n' : '';
  return markdown + datasets.map((dataset) => {
    const typeName = names.datasets.get(dataset.id) ?? 'Data';
    const fieldNames = names.fields.get(dataset.id) ?? new Map();
    const lines = dataset.fields.map((field) => {
      let type = field.type === 'select' && field.options?.length ? field.options.map((option) => JSON.stringify(option)).join(' | ') : base[field.type] ?? 'unknown';
      const optional = !field.required;
      if (optional && field.allow?.null !== false) type = `${type} | null`;
      const key = fieldNames.get(field.id) ?? field.id;
      return `  /** ${String(field.label).replaceAll('*/', '* /')}${field.required ? '（必須）' : '（任意）'} */\n  ${key}${optional && field.allow?.absent !== false ? '?' : ''}: ${type};`;
    });
    return `/** ${String(dataset.name).replaceAll('*/', '* /')} */\nexport interface ${typeName} {\n${lines.join('\n')}\n}\n`;
  }).join('\n');
}

/**
 * 注文の商品（Issue #155）：ダミーデータの「商品」のデータ一覧（role: 'products'）から、注文の部品が読む商品にする。
 * 項目 name（商品名）・price（価格）・image（画像）は決まった id。そのほかの項目は、商品の追加の項目（productFields）になる
 */
export const productRole = 'products';
export const productBaseFields = ['name', 'price', 'image'];
export function productsFromDatasets(datasets: DatasetData[] | undefined): { products: ProductData[]; fields: DataField[] } {
  const dataset = datasets?.find(({ role }) => role === productRole);
  if (!dataset) return { products: [], fields: [] };
  // 利用者が「商品」に足した項目は、商品の一覧に出す（出す・出さないを決める欄が無く、足しても出なかった。#283）。visible: false なら出さない
  const fields = dataset.fields.filter(({ id }) => !productBaseFields.includes(id)).map((field) => ({ ...field, visible: field.visible ?? true }));
  const products = dataset.records.flatMap((record) => {
    const { name, price, image, ...values } = record.values;
    if (typeof name !== 'string' || typeof price !== 'number' || !Number.isFinite(price)) return [];
    return [{ id: record.id, name, price, image: typeof image === 'string' ? image : null, values }];
  });
  return { products, fields };
}

/** 古い案件の商品（project.products・productFields）を、「商品」のデータ一覧にする（Issue #155） */
export function productDataset(products: ProductData[], productFields: DataField[], id = 'products'): DatasetData {
  return {
    id, name: '商品', role: productRole,
    fields: [{ id: 'name', label: '商品名', type: 'text', required: true, codeName: 'name' }, { id: 'price', label: '価格', type: 'number', required: true, min: 0, codeName: 'price' },
      { id: 'image', label: '画像', type: 'image', codeName: 'image' }, ...productFields.filter(({ id }) => !productBaseFields.includes(id))],
    records: products.map((product) => ({ id: product.id, values: { name: product.name, price: product.price, ...(product.image ? { image: product.image } : {}), ...product.values } })),
  };
}
