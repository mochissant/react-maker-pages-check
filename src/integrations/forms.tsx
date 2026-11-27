// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * フォームと入力項目（Issue #118）。components.tsx の汎用部品「フォーム」「入力項目」の中身。
 * - フォームは中に置いた入力項目をまとめて、1回の送信にする。送信は form-api.ts の submitForm（1つの関数で差し替えられる）
 * - 項目ごとに必須・形式・文字数・範囲を検査する。誤りを出す時（入力中・離れたとき・送信時）はフォームで決める
 * - ラベル・説明・誤りは aria-describedby で関連付け、送信で誤りがあれば最初の項目にフォーカスを移し、「ぶるっ」と揺らす
 *   （動きを減らす設定では揺らさない）
 * 状態（送信中・成功・失敗）の文言は、要素設定の「要素の状態表示」で決める（statusMessages）
 */
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { submitForm } from './form-api';
import type { FormValue } from './form-api';
import { useComponentAction, useComponentIsInteractive, useComponentPreviewCondition } from './component-runtime';
import { trackFormSubmission } from '../interactions.ts';

export const fieldKinds = ['テキスト', '複数行', '数値', 'メール', 'パスワード', '選択', '複数選択', 'チェック', 'ラジオ', 'スイッチ', '日付', 'ファイル'] as const;
export const fieldFormats = ['なし', 'メール', '電話番号', '郵便番号', 'URL'] as const;
export const validateTimings = ['送信時', '離れたとき', '入力中'] as const;
type Kind = typeof fieldKinds[number];

type FieldHandle = { name: string; label: string; value: () => FormValue; validate: () => string; focus: () => void; node: () => HTMLElement | null; reset: () => void; omit?: () => boolean };
type FormState = {
  register: (id: string, handle: FieldHandle) => () => void;
  /** 送信を試みたか（「送信時」に誤りを出す） */
  attempted: boolean;
  timing: typeof validateTimings[number];
  /** プレビュー条件「入力の検証エラー」：すべての誤りを出す */
  forceErrors: boolean;
  serverErrors: Readonly<Record<string, string>>;
  interactive: boolean;
};
export const FormContext = createContext<FormState | null>(null);

type StatusSettings = Readonly<Record<string, { text?: string; retryLabel?: string; presentation?: string } | undefined>> | undefined;
const statusText = (settings: StatusSettings, state: string, fallback: string) => settings?.[state]?.text?.trim() || fallback;

function prefersReducedMotion() {
  return document.documentElement.dataset.reducedMotion === 'reduce' || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

/** 入力エラーの「ぶるっ」（motion-presets.js の buru と同じ揺れ） */
function shake(node: HTMLElement | null) {
  if (!node || prefersReducedMotion() || typeof node.animate !== 'function') return;
  node.animate([{ translate: '0' }, { translate: '-8px' }, { translate: '8px' }, { translate: '-6px' }, { translate: '6px' }, { translate: '-3px' }, { translate: '0' }], { duration: 420, easing: 'linear' });
}

export function FormView({ name, submitLabel, timing, statusMessages, interactive, onSuccess, children }: {
  name: string; submitLabel: string; timing: typeof validateTimings[number]; statusMessages: StatusSettings; interactive: boolean;
  /** 送信できたあと（遷移先があれば移る。#232） */
  onSuccess?: () => void; children: ReactNode;
}) {
  const fields = useRef(new Map<string, FieldHandle>());
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Readonly<Record<string, string>>>({});
  const [summary, setSummary] = useState('');
  const [done, setDone] = useState<'success' | null>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const condition = useComponentPreviewCondition('submit');
  const submission = useComponentAction<Record<string, FormValue>, string | undefined>('submit', {
    run: async (values, signal) => {
      const result = await submitForm({ form: name, values }, signal);
      if (!result.ok) {
        setServerErrors(result.fieldErrors ?? {});
        throw new Error(result.message || '送信できませんでした。時間をおいて、もう一度お試しください。');
      }
      return { status: 'success', value: result.message };
    },
    preview: async (values, signal) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (signal.aborted) throw new Error('取り消しました。');
      void values;
      return { status: 'success', value: undefined };
    },
  });
  const state = submission.state.status;
  useEffect(() => { if (state === 'success' || state === 'error') status.current?.focus(); }, [state]);

  async function send() {
    if (!interactive) return false;
    setAttempted(true);
    setServerErrors({});
    const handles = [...fields.current.values()];
    const invalid = handles.filter((field) => field.validate());
    if (invalid.length) {
      setSummary(`入力に誤りが${invalid.length}件あります。`);
      invalid[0].focus();
      shake(invalid[0].node());
      return false;
    }
    setSummary('');
    const values = Object.fromEntries(handles.filter((field) => !field.omit?.()).map((field) => [field.name, field.value()]));
    const success = (await submission.run(values))?.status === 'success';
    if (success) { setDone('success'); onSuccess?.(); }
    return success;
  }

  const context: FormState = {
    register: (id, handle) => { fields.current.set(id, handle); return () => { fields.current.delete(id); }; },
    attempted, timing, forceErrors: condition === 'invalid', serverErrors, interactive,
  };
  const showSuccess = state === 'success' || done === 'success';
  return <FormContext.Provider value={context}>
    <form className="rm-part-form" noValidate aria-busy={state === 'loading' || undefined}
      onSubmit={(event) => { event.preventDefault(); trackFormSubmission(event.currentTarget, send()); }}
      onReset={() => { for (const field of fields.current.values()) field.reset(); setAttempted(false); setServerErrors({}); setSummary(''); setDone(null); submission.reset(); }}>
      {children}
      {(summary || condition === 'invalid') && <p className="rm-part-form-summary" role="alert">{summary || '入力に誤りがあります。'}</p>}
      <button type="submit" className="element-button rm-part-submit" disabled={state === 'loading'}>
        {state === 'loading' ? statusText(statusMessages, 'pending', '送信しています…') : submitLabel.trim() || '送信する'}
      </button>
      {state === 'loading' && <p className="rm-part-form-status" role="status">{statusText(statusMessages, 'pending', '送信しています…')}</p>}
      {state === 'error' && <div className="rm-part-form-status" data-state="error">
        <p ref={status} tabIndex={-1} role="alert">{statusText(statusMessages, 'error', submission.state.status === 'error' && submission.state.message !== '処理に失敗しました。' ? submission.state.message : '送信できませんでした。時間をおいて、もう一度お試しください。')}</p>
        <button type="button" className="element-button" onClick={() => void send()}>{statusMessages?.error?.retryLabel?.trim() || 'もう一度送る'}</button>
      </div>}
      {showSuccess && state !== 'loading' && state !== 'error' && <p ref={status} tabIndex={-1} className="rm-part-form-status" data-state="success" role="status">
        {statusText(statusMessages, 'success', '送信しました。')}</p>}
    </form>
  </FormContext.Provider>;
}

const choiceKinds = new Set<Kind>(['選択', '複数選択', 'ラジオ']);
const listOf = (text: string) => text.split(/[\n、,]/).map((item) => item.trim()).filter(Boolean);

export type FieldSettings = {
  label: string; name: string; kind: string; required: boolean; hint: string; placeholder: string; options: string;
  format: string; minLength: number; maxLength: number; min: number; max: number;
};

/** 値の検査。誤りの文（無ければ空文字） */
export function fieldError(settings: FieldSettings, value: FormValue) {
  const label = settings.label.trim() || '入力';
  const kind = settings.kind as Kind;
  const empty = value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0);
  if (empty) {
    if (!settings.required) return '';
    return kind === 'チェック' || kind === 'スイッチ' ? `${label}を確認して、チェックしてください。`
      : choiceKinds.has(kind) ? `${label}を選んでください。` : kind === 'ファイル' ? `${label}を選んでください。` : `${label}を入力してください。`;
  }
  if (typeof value === 'string' && !['選択', 'ラジオ', '日付', 'ファイル'].includes(kind)) {
    const length = [...value].length;
    if (settings.minLength > 0 && length < settings.minLength) return `${label}は${settings.minLength}文字以上で入力してください。`;
    if (settings.maxLength > 0 && length > settings.maxLength) return `${label}は${settings.maxLength}文字以内で入力してください。`;
    const format = kind === 'メール' ? 'メール' : settings.format;
    if (format === 'メール' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `${label}は、メールアドレスの形（name@example.com）で入力してください。`;
    if (format === '電話番号' && !/^[0-9+\-() ]{10,}$/.test(value)) return `${label}は、電話番号（数字とハイフン）で入力してください。`;
    if (format === '郵便番号' && !/^\d{3}-?\d{4}$/.test(value)) return `${label}は、郵便番号（123-4567）で入力してください。`;
    if (format === 'URL') { try { new URL(value); } catch { return `${label}は、https:// から始まるURLで入力してください。`; } }
  }
  if (kind === '数値') {
    const number = Number(value);
    if (!Number.isFinite(number)) return `${label}は数字で入力してください。`;
    if (settings.min !== 0 || settings.max !== 0) {
      if (number < settings.min) return `${label}は${settings.min}以上にしてください。`;
      if (settings.max > settings.min && number > settings.max) return `${label}は${settings.max}以下にしてください。`;
    }
  }
  return '';
}

export function FieldView(settings: FieldSettings) {
  const form = useContext(FormContext);
  const id = useId();
  const kind = (fieldKinds as readonly string[]).includes(settings.kind) ? settings.kind as Kind : 'テキスト';
  const initial: FormValue = kind === '複数選択' ? [] : kind === 'チェック' || kind === 'スイッチ' ? false : '';
  const [value, setValue] = useState<FormValue>(initial);
  const [touched, setTouched] = useState(false);
  const [changed, setChanged] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const name = settings.name.trim() || settings.label.trim() || id;
  const latest = useRef(value);
  latest.current = value;
  const options = listOf(settings.options);
  const componentInteractive = useComponentIsInteractive();
  const interactive = componentInteractive && (form?.interactive ?? true);

  useEffect(() => form?.register(id, {
    name, label: settings.label, value: () => latest.current, validate: () => fieldError(settings, latest.current),
    focus: () => root.current?.querySelector<HTMLElement>('input, select, textarea')?.focus(), node: () => root.current,
    reset: () => { latest.current = initial; setValue(initial); setTouched(false); setChanged(false); },
  }), [form, id, name, JSON.stringify(settings)]); // eslint-disable-line react-hooks/exhaustive-deps

  const message = form?.serverErrors[name] || fieldError(settings, value);
  const visible = Boolean(message) && (form?.forceErrors || (form?.timing === '入力中' ? changed || form.attempted
    : form?.timing === '離れたとき' ? touched || form.attempted : form?.attempted ?? touched));
  const describedBy = [settings.hint.trim() && `${id}-hint`, visible && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const common = {
    id, name, 'aria-invalid': visible || undefined, 'aria-describedby': describedBy, 'aria-required': settings.required || undefined,
    onBlur: () => setTouched(true), disabled: !interactive,
  };
  const change = (next: FormValue) => { setValue(next); setChanged(true); };
  const label = <>{settings.label.trim() || '入力'}{settings.required ? <span className="rm-part-required">（必須）</span> : <span className="rm-part-required">（任意）</span>}</>;
  const hint = settings.hint.trim() && <p id={`${id}-hint`} className="rm-part-hint">{settings.hint}</p>;
  const error = visible && <p id={`${id}-error`} className="rm-part-error-text">{message}</p>;

  if (kind === '複数選択' || kind === 'ラジオ') {
    const selected = Array.isArray(value) ? value : [];
    return <div ref={root} className="rm-part-field" data-invalid={visible || undefined}>
      <fieldset className="rm-part-choices" aria-describedby={describedBy} aria-invalid={visible || undefined}>
        <legend className="rm-part-label">{label}</legend>
        {hint}
        {(options.length ? options : ['選択肢1', '選択肢2']).map((option, index) => <label key={`${option}-${index}`} className="rm-part-choice">
          <input type={kind === 'ラジオ' ? 'radio' : 'checkbox'} name={kind === 'ラジオ' ? `${name}-${id}` : name} value={option} disabled={!interactive} onBlur={() => setTouched(true)}
            checked={kind === 'ラジオ' ? value === option : selected.includes(option)}
            onChange={({ target }) => change(kind === 'ラジオ' ? option : target.checked ? [...selected, option] : selected.filter((item) => item !== option))} />{option}
        </label>)}
      </fieldset>
      {error}
    </div>;
  }
  if (kind === 'チェック' || kind === 'スイッチ') {
    return <div ref={root} className="rm-part-field" data-invalid={visible || undefined}>
      <label className="rm-part-choice" htmlFor={id}>
        <input type="checkbox" role={kind === 'スイッチ' ? 'switch' : undefined} {...common} checked={value === true} onChange={({ target }) => change(target.checked)} />{label}
      </label>
      {hint}{error}
    </div>;
  }
  const input = kind === '複数行' ? <textarea rows={4} className="rm-part-input" {...common} placeholder={settings.placeholder.trim() || undefined}
    value={String(value ?? '')} onChange={({ target }) => change(target.value)} />
    : kind === '選択' ? <select className="rm-part-input" {...common} value={String(value ?? '')} onChange={({ target }) => change(target.value)}>
      <option value="">選んでください</option>
      {(options.length ? options : ['選択肢1', '選択肢2']).map((option, index) => <option key={`${option}-${index}`} value={option}>{option}</option>)}
    </select>
      : kind === 'ファイル' ? <input type="file" className="rm-part-input" {...common} onChange={({ target }) => change([...(target.files ?? [])].map((file) => file.name))} />
        : <input className="rm-part-input" {...common} placeholder={settings.placeholder.trim() || undefined}
          type={{ 数値: 'number', メール: 'email', パスワード: 'password', 日付: 'date' }[kind as string] ?? (settings.format === '電話番号' ? 'tel' : settings.format === 'URL' ? 'url' : 'text')}
          autoComplete={kind === 'メール' ? 'email' : kind === 'パスワード' ? 'current-password' : undefined}
          inputMode={kind === '数値' ? 'decimal' : undefined}
          value={String(value ?? '')} onChange={({ target }) => change(target.value)} />;
  return <div ref={root} className="rm-part-field" data-invalid={visible || undefined}>
    <label htmlFor={id} className="rm-part-label">{label}</label>
    {hint}{input}{error}
  </div>;
}
