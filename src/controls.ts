// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
export const inputTypes = ['text', 'email', 'number', 'password', 'tel', 'url', 'search', 'date', 'file', 'checkbox', 'radio', 'range'] as const;
export type ControlSettings = {
  type?: typeof inputTypes[number]; name?: string; label?: string; placeholder?: string;
  defaultValue?: string; defaultChecked?: boolean; required?: boolean; disabled?: boolean; readOnly?: boolean;
  options?: string; min?: string; max?: string; step?: string; rows?: number; autoComplete?: string; nativeAppearance?: boolean;
};
export const isNativeControl = (type: string) => ['input', 'textarea', 'select'].includes(type);
export const isLayoutElement = (type: string) => ['container', 'label', 'fieldset'].includes(type);
export function validControl(value: unknown): value is ControlSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const strings = ['name', 'label', 'placeholder', 'defaultValue', 'options', 'min', 'max', 'step', 'autoComplete'];
  const booleans = ['defaultChecked', 'required', 'disabled', 'readOnly', 'nativeAppearance'];
  return Object.entries(value).every(([key, entry]) => entry == null || (strings.includes(key) ? typeof entry === 'string' && entry.length <= 10000
    : booleans.includes(key) ? typeof entry === 'boolean' : key === 'type' ? (inputTypes as readonly unknown[]).includes(entry)
      : key === 'rows' && typeof entry === 'number' && Number.isSafeInteger(entry) && entry >= 1 && entry <= 100));
}
