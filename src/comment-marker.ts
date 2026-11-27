// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 閲覧用のURLから付けるコメント（Issue #171）。GitHub の Issue の本文に、どの画面・要素・条件の話かを、機械で読める形で入れる。
 * 書き出す共有ランタイム（PreviewComments.tsx）と編集GUI（comments.js）の両方で使う
 */
export type CommentContext = { screenId: string; elementId?: string; point?: { x: number; y: number }; width?: number; scenario?: string; state?: string };

const prefix = '<!-- react-maker-comment ';

export function commentMarker(context: CommentContext) {
  return `${prefix}${JSON.stringify(context).replace(/--/g, '\\u002d\\u002d')} -->`;
}

/** Issue の本文から、画面・要素・条件を読む。無ければ null */
export function readCommentMarker(body: unknown): CommentContext | null {
  if (typeof body !== 'string') return null;
  const start = body.indexOf(prefix);
  if (start < 0) return null;
  const end = body.indexOf(' -->', start + prefix.length);
  if (end < 0) return null;
  try {
    const value = JSON.parse(body.slice(start + prefix.length, end)) as Partial<CommentContext>;
    if (typeof value.screenId !== 'string' || !value.screenId) return null;
    const point = value.point && Number.isFinite(value.point.x) && Number.isFinite(value.point.y) ? { x: value.point.x, y: value.point.y } : undefined;
    return { screenId: value.screenId, ...(typeof value.elementId === 'string' ? { elementId: value.elementId } : {}), ...(point ? { point } : {}),
      ...(Number.isFinite(value.width) ? { width: value.width } : {}), ...(typeof value.scenario === 'string' ? { scenario: value.scenario } : {}),
      ...(typeof value.state === 'string' ? { state: value.state } : {}) };
  } catch {
    return null;
  }
}

/** 本文から目印を除いた、人が書いた部分 */
export const commentText = (body: unknown) => (typeof body === 'string' ? body.replace(/<!-- react-maker-comment [\s\S]*? -->/, '').replace(/\n*---\n\(react-maker[^\n]*\)\s*$/, '').trim() : '');

/** 新しい Issue の画面の URL（タイトルと本文を入れた状態） */
export function commentIssueUrl(repository: string, { title, text, context, place }: { title: string; text: string; context: CommentContext; place: string }) {
  const body = `${text}\n\n---\n(react-maker のコメント：${place})\n${commentMarker(context)}`;
  const query = new URLSearchParams({ title, body, labels: 'react-maker-comment' });
  return `https://github.com/${repository}/issues/new?${query}`;
}
