// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 閲覧用のURLでのコメント（Issue #171）。閲覧用のビルド（VITE_RM_PREVIEW_REPO があるとき）だけに出る。
 * 「コメントする」を押して要素をクリックし、書いて送ると、GitHub の新しい Issue の画面を、画面・要素・幅を入れた状態で開く。
 * 編集GUIの「コメント」が、その Issue を読み込む（comment-marker.ts の目印で、どの画面・要素の話かが分かる）
 *
 * パスワード付きの閲覧用のURLで、コメントを受け付けていれば（Issue #275）、GitHub のアカウントが無くても、名前（とメールアドレス）だけで送れる。
 * 「コメントの一覧」で、送ったコメントと、編集する人の返信・対応済みが見える（メールは送らない）
 */
import React, { useEffect, useRef, useState } from 'react';
import { commentIssueUrl } from './comment-marker.ts';
import type { CommentContext } from './comment-marker.ts';
import { addGuestComment, guestAccess, listGuestComments, replyGuestComment } from './guest-comments-client.ts';
import type { GuestAccess, GuestComment } from './guest-comments-client.ts';

type Props = { repository: string; screenId: string; screenName: string; base?: string };
const nameKey = 'rm-guest-name';
function rememberedName() { try { return localStorage.getItem(nameKey) ?? ''; } catch { return ''; } }
function rememberName(name: string) { try { localStorage.setItem(nameKey, name); } catch { /* このページだけで使う */ } }

const style = `
.rm-comments-button { position: fixed; z-index: 2147483000; right: 16px; bottom: 16px; padding: 10px 16px; border: 0; border-radius: 999px; background: #1f2937; color: #fff; font: 600 14px/1.2 system-ui, sans-serif; box-shadow: 0 4px 16px #0000003d; cursor: pointer; }
.rm-comments-button[aria-pressed="true"] { background: #d93025; }
.rm-comments-hint { position: fixed; z-index: 2147483000; left: 50%; top: 12px; translate: -50% 0; padding: 8px 14px; border-radius: 8px; background: #1f2937; color: #fff; font: 14px/1.4 system-ui, sans-serif; }
html[data-rm-commenting] * { cursor: crosshair !important; }
html[data-rm-commenting] [data-element-id]:hover { outline: 2px solid #d93025; outline-offset: 2px; }
.rm-comments-dialog { width: min(420px, calc(100vw - 32px)); padding: 16px; border: 0; border-radius: 12px; font: 14px/1.5 system-ui, sans-serif; }
.rm-comments-dialog textarea { width: 100%; min-height: 96px; box-sizing: border-box; font: inherit; }
.rm-comments-dialog menu { display: flex; justify-content: flex-end; gap: 8px; margin: 12px 0 0; padding: 0; }
.rm-comments-dialog label { display: grid; gap: 4px; margin: 0 0 8px; }
.rm-comments-dialog input { font: inherit; padding: 6px 8px; }
.rm-comments-list-button { position: fixed; z-index: 2147483000; right: 16px; bottom: 64px; padding: 8px 14px; border: 1px solid #1f2937; border-radius: 999px; background: #fff; color: #1f2937; font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer; }
.rm-comments-list { display: grid; gap: 12px; max-height: 60dvh; overflow: auto; margin: 0; padding: 0; list-style: none; }
.rm-comments-list li { display: grid; gap: 4px; padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; }
.rm-comments-list small { color: #4b5563; }
.rm-comments-list ol { margin: 0; padding-left: 16px; }
[role="alert"]:empty { display: none; }
`;

export function PreviewComments({ repository, screenId, screenName, base }: Props) {
  const [active, setActive] = useState(false);
  const [target, setTarget] = useState<{ context: CommentContext; label: string } | null>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState(rememberedName);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [access, setAccess] = useState<GuestAccess | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [comments, setComments] = useState<GuestComment[] | null>(null);
  const [reply, setReply] = useState<{ id: string; text: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const listDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!base) return undefined;
    let stopped = false;
    void guestAccess(base, repository).then((result) => { if (!stopped) setAccess(result); });
    return () => { stopped = true; };
  }, [base, repository]);
  useEffect(() => {
    const html = document.documentElement;
    if (!active) { delete html.dataset.rmCommenting; return undefined; }
    html.dataset.rmCommenting = '';
    function choose(event: MouseEvent) {
      const node = (event.target as Element | null)?.closest<HTMLElement>('[data-element-id]');
      if ((event.target as Element | null)?.closest('.rm-comments-button')) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = node?.getBoundingClientRect();
      const point = node && rect && rect.width && rect.height
        ? { x: Math.round((event.clientX - rect.left) / rect.width * 1000) / 1000, y: Math.round((event.clientY - rect.top) / rect.height * 1000) / 1000 } : undefined;
      const label = (node?.getAttribute('aria-label') || node?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      setTarget({ context: { screenId, ...(node?.dataset.elementId ? { elementId: node.dataset.elementId } : {}), ...(point ? { point } : {}), width: window.innerWidth }, label });
      setActive(false);
    }
    document.addEventListener('click', choose, true);
    return () => { document.removeEventListener('click', choose, true); delete html.dataset.rmCommenting; };
  }, [active, screenId]);
  useEffect(() => { if (target) dialog.current?.showModal(); }, [target]);
  useEffect(() => { if (listOpen) listDialog.current?.showModal(); }, [listOpen]);
  const close = () => { dialog.current?.close(); setTarget(null); setText(''); setError(''); };
  const load = async () => { if (access) setComments(await listGuestComments(access)); };
  async function send(work: () => Promise<void>) {
    setSending(true); setError('');
    try { await work(); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); } finally { setSending(false); }
  }
  const place = target ? `画面「${screenName}」${target.label ? `の「${target.label}」` : ''}・${target.context.width}px` : '';
  return <>
    <style>{style}</style>
    {active && <p className="rm-comments-hint" role="status">コメントする場所をクリックしてください（Esc でやめる）</p>}
    <button type="button" className="rm-comments-button" aria-pressed={active} onClick={() => setActive(!active)}
      onKeyDown={(event) => { if (event.key === 'Escape') setActive(false); }}>{active ? 'やめる' : 'コメントする'}</button>
    {access && <button type="button" className="rm-comments-list-button" onClick={() => { setListOpen(true); void send(load); }}>コメントの一覧</button>}
    {target && <dialog ref={dialog} className="rm-comments-dialog" aria-labelledby="rm-comments-title" onClose={() => { setTarget(null); setText(''); setError(''); }}>
      <h2 id="rm-comments-title" style={{ margin: '0 0 8px', fontSize: 16 }}>コメント：{screenName}{target.label ? `の「${target.label}」` : ''}</h2>
      {access
        ? <p style={{ margin: '0 0 8px', fontSize: 13 }}>名前だけで送れます（GitHub のアカウントは要りません）。画面・要素・幅（{target.context.width}px）は自動で入ります。返信は「コメントの一覧」で見られます。</p>
        : <p style={{ margin: '0 0 8px', fontSize: 13 }}>送ると、GitHub の新しい Issue の画面が開きます（GitHub のアカウントが要ります）。画面・要素・幅（{target.context.width}px）は自動で入ります。</p>}
      {access && <>
        <label>名前<input value={name} autoComplete="name" maxLength={50} onChange={(event) => setName(event.target.value)} /></label>
        <label>メールアドレス（任意。編集する人だけが見ます）<input type="email" value={email} autoComplete="email" maxLength={200} onChange={(event) => setEmail(event.target.value)} /></label>
      </>}
      <label>コメント<textarea value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} /></label>
      <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>{error}</p>
      <menu>
        <button type="button" onClick={close}>やめる</button>
        {access && <button type="button" disabled={!text.trim() || !name.trim() || sending} onClick={() => void send(async () => {
          rememberName(name.trim());
          await addGuestComment(access, { name: name.trim(), email: email.trim(), text: text.trim(), context: target.context, place });
          close();
          setListOpen(true);
          await load();
        })}>送る</button>}
        <button type="button" disabled={!text.trim()} onClick={() => {
          window.open(commentIssueUrl(repository, { title: `コメント：${screenName}${target.label ? `の「${target.label}」` : ''}`, text: text.trim(), context: target.context, place }), '_blank', 'noopener');
          close();
        }}>GitHub で送る</button>
      </menu>
    </dialog>}
    {listOpen && access && <dialog ref={listDialog} className="rm-comments-dialog" aria-labelledby="rm-comments-list-title" onClose={() => { setListOpen(false); setReply(null); }}>
      <h2 id="rm-comments-list-title" style={{ margin: '0 0 8px', fontSize: 16 }}>コメントの一覧</h2>
      <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>{error}</p>
      {comments === null ? <p role="status">読み込み中…</p> : !comments.length ? <p>まだコメントはありません。</p>
        : <ul className="rm-comments-list" aria-label="コメント">{comments.map((comment) => <li key={comment.id}>
          <small>{comment.name}・{comment.place}{comment.resolved ? '・対応済み' : ''}</small>
          <span>{comment.text}</span>
          {comment.replies.length > 0 && <ol aria-label="返信">{comment.replies.map((item, index) => <li key={index}><small>{item.author}{item.editor ? '（編集する人）' : ''}</small> {item.text}</li>)}</ol>}
          {reply?.id === comment.id
            ? <form onSubmit={(event) => { event.preventDefault(); void send(async () => { rememberName(name.trim()); await replyGuestComment(access, { id: comment.id, name: name.trim(), text: reply.text.trim() }); setReply(null); await load(); }); }}>
              {!rememberedName() && <label>名前<input value={name} maxLength={50} onChange={(event) => setName(event.target.value)} /></label>}
              <label>返信<textarea value={reply.text} maxLength={2000} onChange={(event) => setReply({ id: comment.id, text: event.target.value })} /></label>
              <menu><button type="button" onClick={() => setReply(null)}>やめる</button><button type="submit" disabled={!reply.text.trim() || !name.trim() || sending}>返信する</button></menu>
            </form>
            : <button type="button" onClick={() => setReply({ id: comment.id, text: '' })}>返信する</button>}
        </li>)}</ul>}
      <menu><button type="button" onClick={() => listDialog.current?.close()}>閉じる</button></menu>
    </dialog>}
  </>;
}
