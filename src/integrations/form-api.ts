/**
 * フォームの送信先（Issue #118）。利用者が管理するファイルです（再書き出しで上書きしません）。
 * submitForm を1つの関数として差し替えると、すべてのフォームの送信先が変わります。
 * 既定は模擬の送信（少し待って成功）。編集GUIのプレビューでは、要素設定の「部品の操作プレビュー」で結果を切り替えられます。
 */
export type FormValue = string | number | boolean | readonly string[] | null;

export type FormSubmission = {
  /** フォームの名前（要素設定の「送信の名前」） */
  form: string;
  /** 項目の名前 → 値 */
  values: Readonly<Record<string, FormValue>>;
};

export type FormResult =
  | { ok: true; message?: string }
  /** fieldErrors はサーバー側の検証で見つかった項目ごとの誤り（項目の名前 → 文） */
  | { ok: false; message?: string; fieldErrors?: Readonly<Record<string, string>> };

import { siteConfig } from '../site-config';

export async function submitForm(submission: FormSubmission, signal: AbortSignal): Promise<FormResult> {
  // 送信先（編集GUIのプロジェクト設定「フォームの送信先」。Issue #175）。Formspree などの URL か、自前の API
  const endpoint = siteConfig().formEndpoint;
  if (typeof endpoint === 'string' && /^https:\/\/[^\s"<>]+$/.test(endpoint)) {
    try {
      // 項目をそのまま JSON で送る。フォームの名前は _form に入れる（Formspree などは JSON を受け付ける）
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ _form: submission.form, ...submission.values }), signal });
      if (response.ok) return { ok: true };
      const body = await response.json().catch(() => null) as { errors?: Array<{ field?: string; message?: string }> } | null;
      const fieldErrors = Object.fromEntries((body?.errors ?? []).filter((error) => error.field && error.message).map((error) => [error.field as string, error.message as string]));
      return { ok: false, ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}) };
    } catch {
      return { ok: false };
    }
  }
  // 送信先が無いときは、模擬の送信（少し待って成功）
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (signal.aborted) return { ok: false };
  void submission;
  return { ok: true };
}
