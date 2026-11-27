// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { DatasetData, ElementData } from './model-types.ts';

export type ComboboxOption = { value: string; label: string; disabled?: boolean };
export type ComboboxSettings = { options?: ComboboxOption[]; datasetId?: string; labelField?: string; valueField?: string; disabledField?: string };
export const comboboxParts = ['label', 'input', 'list', 'option', 'value', 'empty', 'error'] as const;
export type ComboboxPart = typeof comboboxParts[number];
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 10000;
export function validCombobox(value: unknown): value is ComboboxSettings {
  if (!object(value)) return false;
  return Object.entries(value).every(([key, entry]) => entry === undefined || (key === 'options'
    ? Array.isArray(entry) && entry.length <= 1000 && entry.every((option) => object(option) && text(option.value) && Boolean(option.value) && text(option.label) && Boolean(option.label.trim()) && (option.disabled === undefined || typeof option.disabled === 'boolean')) && new Set(entry.map((option: ComboboxOption) => option.value)).size === entry.length
    : ['datasetId', 'labelField', 'valueField', 'disabledField'].includes(key) && text(entry)));
}
export function comboboxOptions(settings: ComboboxSettings, datasets: readonly DatasetData[]): ComboboxOption[] {
  if (!settings.datasetId) return settings.options ?? [];
  const dataset = datasets.find(({ id }) => id === settings.datasetId);
  if (!dataset || ['loading', 'error'].includes(dataset.status ?? '')) return [];
  const seen = new Set<string>();
  return dataset.records.flatMap((record) => {
    const label = record.values[settings.labelField ?? ''];
    const value = settings.valueField ? record.values[settings.valueField] : record.id;
    if (!['string', 'number'].includes(typeof value) || !['string', 'number'].includes(typeof label)) return [];
    const key = String(value);
    if (!key || seen.has(key) || !String(label).trim()) return [];
    seen.add(key);
    return [{ value: key, label: String(label), disabled: Boolean(settings.disabledField && record.values[settings.disabledField] === true) }];
  });
}
export const filterComboboxOptions = (options: readonly ComboboxOption[], query: string) => {
  const normalized = query.normalize('NFKC').toLocaleLowerCase().trim();
  return options.filter(({ label }) => label.normalize('NFKC').toLocaleLowerCase().includes(normalized));
};
/** The roles belong to the editable tree, so IDs can be remapped for every shared instance. */
export function comboboxStructureProblem(root: ElementData): string {
  const found = new Map<string, ElementData[]>();
  const visit = (node: ElementData, parent?: ElementData) => {
    if (node !== root && node.combobox) return;
    if (node.comboboxPart) {
      found.set(node.comboboxPart, [...(found.get(node.comboboxPart) ?? []), node]);
      if (node.comboboxPart === 'option' && parent?.comboboxPart !== 'list') found.set('bad-option', [node]);
    }
    for (const child of node.children ?? []) visit(child, node);
  };
  visit(root);
  if (comboboxParts.some((part) => found.get(part)?.length !== 1)) return 'ラベル・入力・候補一覧・候補・候補の文言・候補なし・エラーを1つずつ指定してください。';
  if (found.has('bad-option')) return '候補は候補一覧の直下に置いてください。';
  const option = found.get('option')![0];
  const containsValue = (node: ElementData): boolean => node.comboboxPart === 'value' || Boolean(node.children?.some(containsValue));
  if (!containsValue(option)) return '候補の文言は候補の中に置いてください。';
  const interactive = (node: ElementData): boolean => ['button', 'input', 'select', 'textarea', 'custom'].includes(node.type) || Boolean(node.combobox || node.action || node.interactions?.length || node.richText?.some(({ spans }) => spans.some(({ link }) => link)) || node.children?.some(interactive));
  if ((option.children ?? []).some(interactive)) return '候補の中は文言や装飾にしてください。別のボタン・入力・操作は候補の外に置いてください。';
  return '';
}
