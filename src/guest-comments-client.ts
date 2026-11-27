// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 閲覧用のURLで、GitHub のアカウントが無い人がコメントを送る・読む（Issue #275）。
 * パスワード付きの閲覧用のURLで、鍵を開けたときに覚えたパスワードの秘密鍵（auth）で、パスワードを知っていることを示す（server/guest-comments.js）。
 * パスワードそのものは、このページにも、サーバーにも残さない
 */
import type { CommentContext } from './comment-marker.ts';

export type GuestAccess = { url: string; repository: string; preview: string; auth: CryptoKey };
export type GuestReply = { author: string; text: string; createdAt: string; editor: boolean };
export type GuestComment = { id: string; name: string; text: string; context: CommentContext; place: string; createdAt: string; resolved: boolean; replies: GuestReply[] };

const urlPattern = /^(https:\/\/[^\s"'<>\\]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s"'<>\\]*)$/;

/** 閲覧用のURLの id（BASE_URL の …/preview/<id>/） */
export const previewIdFrom = (base: string) => /\/preview\/([A-Za-z0-9_-]{8,64})\/$/.exec(base)?.[1] ?? null;

async function storedAuth(base: string): Promise<CryptoKey | null> {
  const value = await new Promise<{ key?: unknown; auth?: unknown; authWrapped?: unknown; expires?: unknown } | null>((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const request = indexedDB.open('rm-lock', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      try {
        const get = request.result.transaction('keys').objectStore('keys').get(base);
        get.onsuccess = () => {
          const record: unknown = get.result;
          resolve(record && typeof record === 'object' ? record : null);
        };
        get.onerror = () => resolve(null);
      } catch { resolve(null); }
    };
  });
  if (!value || typeof value.expires !== 'number' || value.expires <= Date.now()) return null;
  // 以前に開いた Chrome・Firefox の記録も引き続き使える。
  if (value.auth instanceof CryptoKey) return value.auth;
  if (!(value.key instanceof CryptoKey) || !value.authWrapped || typeof value.authWrapped !== 'object') return null;
  const wrapped = value.authWrapped as { iv?: unknown; data?: unknown };
  if (!(wrapped.iv instanceof Uint8Array) || !(wrapped.data instanceof ArrayBuffer)) return null;
  try {
    const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(wrapped.iv), additionalData: new TextEncoder().encode('react-maker-preview-auth-v1') }, value.key, wrapped.data));
    try { return await crypto.subtle.importKey('pkcs8', bytes, { name: 'X25519' }, false, ['deriveBits']); }
    finally { bytes.fill(0); }
  } catch { return null; }
}

/** コメントを受け付けている閲覧用のURLで、鍵を開けていれば、送り先と鍵を返す。使えなければ null（GitHub の Issue で送る） */
export async function guestAccess(base: string, repository: string): Promise<GuestAccess | null> {
  const preview = previewIdFrom(base);
  if (!preview || !globalThis.crypto?.subtle) return null;
  try {
    // 鍵を開けていなければ（パスワードの無い閲覧用のURLを含む）、鍵のファイルを読みに行かない（無いファイルの 404 がコンソールに出ていた。#219）
    const auth = await storedAuth(base);
    if (!auth) return null;
    const response = await fetch(`${base}__rm-lock/lock.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    const sealed: unknown = await response.json();
    const url = sealed && typeof sealed === 'object' ? (sealed as { comments?: unknown }).comments : undefined;
    if (typeof url !== 'string' || !urlPattern.test(url)) return null;
    return { url, repository, preview, auth };
  } catch { return null; }
}

const toBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

/** パスワードを知っていることの証明：サーバーの使い捨ての公開鍵とパスワードの秘密鍵で共有の値を作り、nonce に HMAC を付ける */
export async function guestProof(auth: CryptoKey, challenge: { nonce: string; time: number; server: string }) {
  const subtle = globalThis.crypto.subtle;
  const server = await subtle.importKey('raw', fromBase64(challenge.server), { name: 'X25519' }, false, []);
  const shared = await subtle.deriveBits({ name: 'X25519', public: server }, auth, 256);
  const mac = await subtle.importKey('raw', shared, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64(await subtle.sign('HMAC', mac, new TextEncoder().encode(`${challenge.nonce}.${challenge.time}`)));
}

async function call<T>(access: GuestAccess, op: 'list' | 'add' | 'reply', body: Record<string, unknown> = {}): Promise<T> {
  const target = (query: string) => `${access.url}?${query}`;
  const params = new URLSearchParams({ repo: access.repository, preview: access.preview });
  const challengeResponse = await fetch(target(`op=challenge&${params}`), { cache: 'no-store' });
  const challenge: unknown = await challengeResponse.json().catch(() => null);
  if (!challengeResponse.ok || !challenge || typeof challenge !== 'object') throw new Error((challenge as { error?: string } | null)?.error ?? 'コメントの送り先につながりませんでした。');
  const { nonce, time, server } = challenge as { nonce: string; time: number; server: string };
  const proof = await guestProof(access.auth, { nonce, time, server });
  const response = await fetch(target(`op=${op}`), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: access.repository, preview: access.preview, nonce, time, proof, ...body }) });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((result as { error?: string } | null)?.error ?? 'コメントを送れませんでした。');
  return result as T;
}

export const listGuestComments = async (access: GuestAccess) => (await call<{ comments: GuestComment[] }>(access, 'list')).comments;
export const addGuestComment = (access: GuestAccess, comment: { name: string; email: string; text: string; context: CommentContext; place: string }) => call<{ id: string }>(access, 'add', comment);
export const replyGuestComment = (access: GuestAccess, reply: { id: string; name: string; text: string }) => call<{ ok: true }>(access, 'reply', reply);
