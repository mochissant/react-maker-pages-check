// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import React, { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { FormContext } from './integrations/forms';
import { comboboxOptions, comboboxStructureProblem, filterComboboxOptions, type ComboboxOption } from './combobox.ts';
import type { DatasetData, ElementData } from './model-types.ts';

export type ComboboxControl = { value?: string; onValueChange?: (value: string) => void };
export type ComboboxRenderer = (element: ElementData, content?: (props: HTMLAttributes<HTMLElement>) => ReactNode, states?: Array<'checked' | 'disabled' | 'focus'>) => ReactNode;
/** WAI-ARIA APG editable, restricted-choice combobox. DOM focus stays on the input.
 * Composition follows shadcn's Input / Content / List / Item / Empty parts; the actual
 * part tree, text and styles belong to the user's shared component, not a widget skin.
 * https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
 * https://ui.shadcn.com/docs/components/base/combobox
 */
export function ComboboxView({ root, datasets, editing, render, value, onValueChange }: ComboboxControl & {
  root: ElementData; datasets: readonly DatasetData[]; editing: boolean; render: ComboboxRenderer;
}) {
  const id = useId(); const input = useRef<HTMLInputElement | null>(null);
  const form = useContext(FormContext); const control = root.control ?? {};
  const options = comboboxOptions(root.combobox ?? {}, datasets);
  const [local, setLocal] = useState(control.defaultValue ?? '');
  const selected = value === undefined ? local : value;
  const echoed = useRef(selected);
  const labelOf = (key: string) => options.find(({ value }) => value === key)?.label ?? '';
  const [query, setQuery] = useState<string | null>(null); const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null); const [touched, setTouched] = useState(false); const [changed, setChanged] = useState(false);
  const composing = useRef(false);
  const disabled = Boolean(control.disabled || form?.interactive === false); const readOnly = Boolean(control.readOnly);
  const filtered = filterComboboxOptions(options, query ?? '');
  const enabled = filtered.filter((option) => !option.disabled);
  const activeOption = enabled.find((option) => option.value === active);
  const suggestion = activeOption?.value ?? selected;
  const expanded = !editing && !disabled && !readOnly && open;
  const name = control.name?.trim() || id;
  const commit = (next: string) => { echoed.current = next; if (value === undefined) setLocal(next); onValueChange?.(next); };
  const current = useRef({ selected, options, commit, disabled, control });
  current.current = { selected, options, commit, disabled, control };
  const problem = comboboxStructureProblem(root);
  const errorPart = (() => { const find = (nodes: ElementData[]): ElementData | undefined => { for (const node of nodes) { if (node.comboboxPart === 'error') return node; const child = find(node.children ?? []); if (child) return child; } }; return find(root.children ?? []); })();
  function validation() {
    const data = current.current;
    if (data.disabled || data.control.readOnly) return '';
    return problem || (data.selected && !data.options.some((option) => option.value === data.selected && !option.disabled) || data.control.required && !data.selected ? errorPart?.text || '候補から選んでください。' : '');
  }
  const message = form?.serverErrors[name] || validation();
  const showError = !editing && Boolean(message) && (form?.forceErrors || form?.attempted || (form?.timing === '入力中' ? changed : touched));
  const reset = () => { current.current.commit(current.current.control.defaultValue ?? ''); setQuery(null); setOpen(false); setActive(null); setTouched(false); setChanged(false); };
  useEffect(() => form?.register(id, {
    name, label: control.label || name, value: () => current.current.selected, validate: validation,
    focus: () => input.current?.focus(), node: () => input.current, omit: () => current.current.disabled,
    reset,
  }), [form, id, name, problem, errorPart?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (form || editing) return;
    const parent = input.current?.form; parent?.addEventListener('reset', reset);
    return () => parent?.removeEventListener('reset', reset);
  }, [form, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  // Native validation must match the committed value before a consumer can submit.
  useLayoutEffect(() => { input.current?.setCustomValidity(!editing && !form ? validation() : ''); });
  useEffect(() => { if (echoed.current !== selected) { setQuery(null); setActive(null); } echoed.current = selected; }, [selected]);
  useEffect(() => { if (disabled || readOnly) setOpen(false); }, [disabled, readOnly]);
  useEffect(() => {
    if (!expanded || !activeOption) return;
    input.current?.ownerDocument.getElementById(`${id}-option-${options.findIndex(({ value }) => value === activeOption.value)}`)?.scrollIntoView({ block: 'nearest' });
  }, [expanded, activeOption?.value]);
  function choose(option: ComboboxOption) {
    if (disabled || readOnly || option.disabled) return;
    commit(option.value); setQuery(null); setOpen(false); setActive(null); setChanged(true);
  }
  const draw = (node: ElementData, option?: ComboboxOption): ReactNode => {
    if (node.combobox) return render(node);
    const children = () => (node.children ?? []).map((child) => <React.Fragment key={child.id}>{draw(child, option)}</React.Fragment>);
    const part = node.comboboxPart;
    if (part === 'input') return render(node, (props) => <input {...props} id={`${id}-input`} ref={input} type="text" role="combobox" name={undefined}
      aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={expanded} aria-controls={`${id}-list`} aria-labelledby={`${id}-label`}
      aria-activedescendant={expanded && activeOption ? `${id}-option-${options.findIndex(({ value }) => value === activeOption.value)}` : undefined}
      aria-invalid={showError || undefined} aria-describedby={showError ? `${id}-error` : undefined} required={control.required}
      disabled={!editing && disabled} readOnly={editing || readOnly} tabIndex={editing ? -1 : undefined} autoComplete={control.autoComplete ?? 'off'} placeholder={control.placeholder}
      value={query ?? labelOf(selected)} onPointerDown={(event) => { if (editing) event.preventDefault(); props.onPointerDown?.(event); }}
      onClick={(event) => { props.onClick?.(event); if (!editing && !disabled && !readOnly) setOpen(true); }}
      onFocus={(event) => { props.onFocus?.(event); if (!editing && !disabled && !readOnly) setOpen(true); }}
      onBlur={(event) => { props.onBlur?.(event); setOpen(false); setQuery(null); setActive(null); setTouched(true); }}
      onInvalid={(event) => {
        // The editable error part supplies feedback. Native Firefox validation bubbles
        // can keep consuming clicks after a valid option has replaced the invalid value.
        event.preventDefault(); setTouched(true);
        const node = event.currentTarget;
        const first = node.form?.querySelector('input:invalid, textarea:invalid, select:invalid');
        if (!first || first === node) node.focus();
      }}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(null); setChanged(true); if (selected) commit(''); }}
      onKeyDown={(event) => {
        if (editing || disabled || readOnly || composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); event.stopPropagation(); setOpen(true);
          const index = enabled.findIndex(({ value }) => value === active);
          const next = event.key === 'ArrowDown' ? index < 0 ? 0 : Math.min(index + 1, enabled.length - 1) : index < 0 ? enabled.length - 1 : Math.max(index - 1, 0);
          setActive(enabled[next]?.value ?? null);
        } else if (event.key === 'Enter' && expanded) {
          event.preventDefault(); event.stopPropagation(); if (activeOption) choose(activeOption);
        } else if (event.key === 'Escape' && expanded) {
          event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(null); setActive(null);
        } else { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) setActive(null); props.onKeyDown?.(event); }
      }} />);
    if (part === 'label') return render(node, (props) => <label {...props} id={`${id}-label`} htmlFor={`${id}-input`}>{node.text}{children()}</label>);
    if (part === 'list') return render(node, (props) => <div {...props} id={`${id}-list`} role="listbox" tabIndex={-1} aria-labelledby={`${id}-label`} hidden={!editing && !expanded}>{children()}</div>);
    if (part === 'option') return (editing ? options.length ? options.slice(0, 1) : [{ value: '', label: '候補' }] : filtered).map((item) => <React.Fragment key={item.value}>{render(node, (props) => <div {...props}
      id={`${id}-option-${options.findIndex(({ value }) => value === item.value)}`} role="option" aria-selected={item.value === suggestion} aria-disabled={item.disabled || undefined}
      data-combobox-active={item.value === activeOption?.value ? '' : undefined} tabIndex={undefined}
      onPointerDown={(event) => { if (!editing) event.preventDefault(); props.onPointerDown?.(event); }}
      onClick={(event) => { if (editing) props.onClick?.(event); else if (!item.disabled) { choose(item); props.onClick?.(event); input.current?.focus(); } }}
      onPointerMove={(event) => { props.onPointerMove?.(event); if (!editing && !item.disabled) setActive(item.value); }}>{(node.children ?? []).map((child) => <React.Fragment key={child.id}>{draw(child, item)}</React.Fragment>)}</div>, item.disabled ? ['disabled'] : [...(item.value === suggestion ? ['checked' as const] : []), ...(item.value === activeOption?.value ? ['focus' as const] : [])])}</React.Fragment>);
    if (part === 'value') return render(node, (props) => <span {...props}>{option?.label ?? node.text}{children()}</span>);
    if (part === 'empty') return render(node, (props) => <div {...props} role="status" hidden={!editing && (!expanded || filtered.length > 0)}>{node.text}{children()}</div>);
    if (part === 'error') return render(node, (props) => <div {...props} id={`${id}-error`} hidden={!editing && !showError}>{editing ? node.text : message}{children()}</div>);
    if (node.type === 'container') return render(node, (props) => <div {...props}>{children()}</div>);
    if (node.type === 'label') return render(node, (props) => <label {...props}>{node.text}{children()}</label>);
    if (node.type === 'fieldset') return render(node, (props) => <fieldset {...props}><legend>{node.text}</legend>{children()}</fieldset>);
    return render(node);
  };
  if (problem && !editing) return <p role="alert">Combobox：{problem}</p>;
  return <>{!editing && <input type="hidden" name={name} value={selected} disabled={disabled} />}{problem && <p role="alert">Combobox：{problem}</p>}{(root.children ?? []).map((node) => <React.Fragment key={node.id}>{draw(node)}</React.Fragment>)}</>;
}
