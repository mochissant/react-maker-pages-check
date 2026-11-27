// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import { useContext, useEffect, useId, useRef, useState, type HTMLAttributes } from 'react';
import { FormContext } from './integrations/forms';
import type { FormValue } from './integrations/form-api';
import type { ControlSettings } from './controls.ts';

type ControlNode = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isInput = (node: ControlNode | null): node is HTMLInputElement => node?.tagName === 'INPUT';
export function ControlView({ kind, control, scope, labelled, editing, ...props }: HTMLAttributes<HTMLElement> & {
  kind: string; control: ControlSettings; scope: string; labelled: boolean; editing: boolean;
}) {
  const id = useId(); const node = useRef<ControlNode | null>(null);
  const form = useContext(FormContext); const [touched, setTouched] = useState(false); const [changed, setChanged] = useState(false);
  const type = control.type ?? 'text'; const name = control.name?.trim() || id;
  const disabled = !editing && (control.disabled || form?.interactive === false);
  function value(): FormValue {
    const current = node.current;
    if (isInput(current)) {
      if (current.type === 'checkbox') return current.checked;
      if (current.type === 'radio') return current.checked ? current.value : null;
      if (current.type === 'file') return [...(current.files ?? [])].map(({ name }) => name);
    }
    return current?.value ?? '';
  }
  function validation() { return !node.current || node.current.disabled || node.current.validity.valid ? '' : node.current.validationMessage; }
  useEffect(() => form?.register(id, {
    name, label: control.label || name, value, validate: validation, focus: () => node.current?.focus(), node: () => node.current,
    omit: () => Boolean(node.current?.disabled || isInput(node.current) && type === 'radio' && !node.current.checked),
    reset: () => {
      const current = node.current;
      if (isInput(current) && ['checkbox', 'radio'].includes(type)) current.checked = Boolean(control.defaultChecked);
      else if (current) current.value = type === 'file' ? '' : control.defaultValue ?? '';
      setTouched(false); setChanged(false);
    },
  }), [form, id, name, JSON.stringify(control), type]); // eslint-disable-line react-hooks/exhaustive-deps
  const message = form?.serverErrors[name] || validation();
  const visible = !editing && Boolean(message) && (form?.forceErrors || form?.attempted || (form?.timing === '入力中' ? changed : touched));
  const common = {
    ...props, id, ref: (element: ControlNode | null) => { node.current = element; }, name: kind === 'input' && type === 'radio' ? `${scope}:${name}` : name,
    'aria-label': labelled ? undefined : control.label?.trim() || '入力', 'aria-invalid': visible || undefined,
    'aria-describedby': [props['aria-describedby'], visible && `${id}-error`].filter(Boolean).join(' ') || undefined,
    required: Boolean(control.required), disabled, tabIndex: editing ? -1 : props.tabIndex,
    onClick: (event: React.MouseEvent<HTMLElement>) => { if (editing) event.preventDefault(); props.onClick?.(event); },
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => { if (editing) event.preventDefault(); props.onPointerDown?.(event); },
    onBlur: (event: React.FocusEvent<HTMLElement>) => { setTouched(true); props.onBlur?.(event); },
    onChange: () => setChanged(true),
    style: { ...props.style, ...(control.nativeAppearance === false ? { appearance: 'none' as const } : {}) },
  };
  const options = [...new Set((control.options ?? '').split(/[\n、,]/).map((value) => value.trim()).filter(Boolean))];
  const field = kind === 'select' ? <select {...common} defaultValue={control.defaultValue ?? ''}>
    <option value="">{control.placeholder || '選んでください'}</option>{options.map((value) => <option key={value} value={value}>{value}</option>)}
  </select> : kind === 'textarea' ? <textarea {...common} readOnly={editing || control.readOnly} rows={control.rows ?? 3} placeholder={control.placeholder} defaultValue={control.defaultValue ?? ''} />
    : <input {...common} type={type} role={props.role} readOnly={editing || control.readOnly} placeholder={control.placeholder} autoComplete={control.autoComplete}
      min={control.min} max={control.max} step={control.step} defaultChecked={control.defaultChecked} defaultValue={type === 'file' ? undefined : control.defaultValue ?? (type === 'radio' || type === 'checkbox' ? 'on' : '')} />;
  return <>{field}{visible && <span id={`${id}-error`} aria-hidden="true" className="rm-part-error-text">{message}</span>}</>;
}
