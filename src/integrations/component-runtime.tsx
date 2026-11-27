// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** invalid（入力の検証エラー）・success（成功）はフォーム（Issue #118）のプレビュー条件 */
export type PreviewCondition = 'loading' | 'empty' | 'error' | 'unknown' | 'invalid' | 'success';
type ActionResult<T> = { status: 'success'; value: T } | { status: 'empty' };
type ActionState<T> = { status: 'idle' | 'loading' | 'empty' } | ActionResult<T> | { status: 'error'; message: string };

const SharedState = createContext<{
  values: ReadonlyMap<string, unknown>;
  update: (key: string, updater: (value: unknown, exists: boolean) => unknown) => void;
} | null>(null);

const ComponentEnvironment = createContext<{
  preview: boolean;
  interactive: boolean;
  conditions: Partial<Record<string, PreviewCondition>>;
} | null>(null);

export function useComponentPreviewCondition(id: string) {
  const environment = useContext(ComponentEnvironment);
  return environment?.preview && Object.hasOwn(environment.conditions, id) ? environment.conditions[id] : undefined;
}

export function useComponentIsPreview() {
  return useContext(ComponentEnvironment)?.preview ?? false;
}

export function useComponentIsInteractive() {
  return useContext(ComponentEnvironment)?.interactive ?? true;
}

export function ComponentSession({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<ReadonlyMap<string, unknown>>(() => new Map());
  const latest = useRef(values);
  function update(key: string, updater: (value: unknown, exists: boolean) => unknown) {
    const current = latest.current;
    const next = new Map(current).set(key, updater(current.get(key), current.has(key)));
    latest.current = next;
    setValues(next);
  }
  return <SharedState.Provider value={{ values, update }}>{children}</SharedState.Provider>;
}

export function ComponentEnvironmentProvider({ preview, interactive, conditions, children }: {
  preview: boolean;
  interactive: boolean;
  conditions: Partial<Record<string, PreviewCondition>>;
  children: ReactNode;
}) {
  return <ComponentEnvironment.Provider value={{ preview, interactive, conditions }}>{children}</ComponentEnvironment.Provider>;
}

export function useSharedComponentState<T>(key: string, initial: T) {
  const session = useContext(SharedState);
  if (!session) throw new Error('共有状態を使う部品は ComponentSession の中に配置してください。');
  const value = session.values.has(key) ? session.values.get(key) as T : initial;
  const update = (updater: (current: T) => T) => session.update(key,
    (current, exists) => updater(exists ? current as T : initial));
  return [value, update] as const;
}

/** GUIで定義した状態も、登録部品と同じセッションのuseStateを使う。 */
export function useComponentStateStore() {
  const session = useContext(SharedState);
  if (!session) throw new Error('状態は ComponentSession の中で使ってください。');
  return session;
}

export function useComponentAction<Input, Output>(id: string, handlers: {
  run: (input: Input, signal: AbortSignal) => Promise<ActionResult<Output>>;
  preview: (input: Input, signal: AbortSignal) => Promise<ActionResult<Output>>;
}) {
  const environment = useContext(ComponentEnvironment);
  if (!environment) throw new Error('操作を使う部品は defineComponent で登録してください。');
  const { preview, interactive, conditions } = environment;
  const condition = preview && Object.hasOwn(conditions, id) ? conditions[id] : undefined;
  const [result, setResult] = useState<ActionState<Output>>({ status: 'idle' });
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    setResult({ status: 'idle' });
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [preview, interactive, condition]);

  const state: ActionState<Output> = condition === 'error' || condition === 'unknown' ? { status: 'error', message: '処理に失敗しました。' }
    : condition === 'success' ? { status: 'success', value: undefined as Output }
      : condition === 'invalid' ? { status: 'idle' } : condition ? { status: condition } : result;

  async function run(input: Input): Promise<ActionResult<Output> | undefined> {
    if (!interactive || pending.current || condition) return undefined;
    const controller = new AbortController();
    pending.current = controller;
    setResult({ status: 'loading' });
    try {
      const outcome = await (preview ? handlers.preview : handlers.run)(input, controller.signal);
      if (controller.signal.aborted) return undefined;
      setResult(outcome);
      return outcome;
    } catch (error) {
      if (!controller.signal.aborted) {
        setResult({ status: 'error', message: error instanceof Error ? error.message : '処理に失敗しました。' });
      }
      return undefined;
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  const reset = () => { if (!pending.current) setResult({ status: 'idle' }); };
  return { state, run, reset };
}
