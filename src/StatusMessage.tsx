// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import React, { type Ref } from 'react';
import { statusText } from './status.ts';
import type { StatusMessages } from './model-types.ts';

export type StatusMessageProps = {
  state: string;
  settings?: StatusMessages | null;
  fallback: string;
  onRetry?: (() => void) | null;
  messageRef?: Ref<HTMLParagraphElement>;
  focusable?: boolean;
};

export function StatusMessage({ state, settings, fallback, onRetry, messageRef, focusable }: StatusMessageProps) {
  const retry = state === 'error' && onRetry && settings?.error?.retryLabel?.trim();
  const panel = settings?.[state]?.presentation === 'panel';
  const message = <p ref={messageRef} tabIndex={focusable ? -1 : undefined} role={state === 'error' ? 'alert' : 'status'}>
    {statusText(settings, state, fallback)}
  </p>;
  if (!panel && !retry) return message;
  return <div className={panel ? 'state-notice' : undefined}>
    {message}
    {retry && onRetry && <button type="button" onClick={onRetry}>{retry}</button>}
  </div>;
}
