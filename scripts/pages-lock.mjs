// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 閲覧用のURLの簡単なパスワード（Issue #168）。GitHub Pages は静的な配信なので、ページの中身を暗号化して置き、
 * ブラウザでパスワードを入れると復号する（StatiCrypt と同じ考え方。Web Crypto の PBKDF2・X25519・AES-GCM）。
 *
 * パスワードを、リポジトリにもワークフローの入力にもログにも残さないため、公開鍵の形にする：
 * 1. 発行する人の編集GUI：パスワード → PBKDF2 → X25519 の秘密鍵 → 公開鍵。ワークフローには公開鍵と塩だけを渡す
 * 2. ワークフロー：中身の鍵（AES-GCM）を作ってすべてのファイルを暗号化し、使い捨ての鍵と公開鍵の X25519 で中身の鍵を包む
 * 3. 見る人のブラウザ：パスワード → 同じ秘密鍵 → 使い捨ての公開鍵との X25519 → 中身の鍵を取り出す
 *
 * これは「簡単な」パスワードで、機密を守るものではない（暗号化したファイルは誰でも取れ、短いパスワードは総当たりで破られうる）。
 * 編集GUI（ブラウザ）・ワークフロー（Node 22）・閲覧用のページ（ブラウザ）で同じ関数を使う。
 * passwordKeyPair・unlockContentKey・decryptBytes は、閲覧用のページに文字のまま埋め込むので、互いのほかは外を参照しない
 */
export const lockIterations = 600_000;

export function toBase64(bytes) {
  let text = '';
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text);
}

export function fromBase64(text) {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

/** パスワードと塩から、X25519 の秘密鍵（と公開鍵）を作る */
export async function passwordKeyPair(password, salt, iterations, extractable = false) {
  const subtle = globalThis.crypto.subtle;
  const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const seed = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256));
  // X25519 の秘密鍵の PKCS#8（RFC 8410）。先頭の16バイトは決まった形
  const pkcs8 = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20, ...seed]);
  const privateKey = await subtle.importKey('pkcs8', pkcs8, { name: 'X25519' }, true, ['deriveBits']);
  const jwk = await subtle.exportKey('jwk', privateKey);
  const publicKey = Uint8Array.from(atob(jwk.x.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (jwk.x.length % 4)) % 4)), (character) => character.charCodeAt(0));
  return { privateKey: await subtle.importKey('pkcs8', pkcs8, { name: 'X25519' }, extractable, ['deriveBits']), publicKey };
}

/** 発行する人：パスワードから、ワークフローに渡す鍵の情報（公開鍵と塩。秘密ではない）を作る */
export async function lockFromPassword(password, { iterations = lockIterations } = {}) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const { publicKey } = await passwordKeyPair(password, salt, iterations);
  return { v: 1, salt: toBase64(salt), iterations, publicKey: toBase64(publicKey) };
}

/** 中身の鍵を、公開鍵で包む（ワークフロー）。返り値：{ key（中身の鍵）, sealed（閲覧用のページに置く情報） } */
export async function sealContentKey(lock) {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const recipient = await subtle.importKey('raw', fromBase64(lock.publicKey), { name: 'X25519' }, false, []);
  const ephemeral = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const shared = await subtle.deriveBits({ name: 'X25519', public: recipient }, ephemeral.privateKey, 256);
  const wrapping = await subtle.importKey('raw', shared, 'AES-GCM', false, ['encrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle.encrypt({ name: 'AES-GCM', iv }, wrapping, await subtle.exportKey('raw', key));
  return {
    key,
    sealed: { v: 1, salt: lock.salt, iterations: lock.iterations, ephemeral: toBase64(await subtle.exportKey('raw', ephemeral.publicKey)), iv: toBase64(iv), wrapped: toBase64(wrapped),
      // GitHub のアカウントが無い人のコメントの受け付け先（Issue #275）。閲覧用のページが読む
      ...(typeof lock.comments === 'string' && lock.comments.length < 300 && commentsUrlPattern.test(lock.comments) ? { comments: lock.comments } : {}) },
  };
}

/**
 * 見る人：パスワードで中身の鍵を取り出す。パスワードが違えば Error。
 * auth はパスワードの秘密鍵（取り出せない鍵）。コメントを書くとき、パスワードを知っていることの証明に使う（Issue #275）
 */
export async function unlockWithAuth(password, sealed) {
  const subtle = globalThis.crypto.subtle;
  const decode = (text) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
  const { privateKey } = await passwordKeyPair(password, decode(sealed.salt), sealed.iterations, true);
  const ephemeral = await subtle.importKey('raw', decode(sealed.ephemeral), { name: 'X25519' }, false, []);
  const shared = await subtle.deriveBits({ name: 'X25519', public: ephemeral }, privateKey, 256);
  const wrapping = await subtle.importKey('raw', shared, 'AES-GCM', false, ['decrypt']);
  const raw = await subtle.decrypt({ name: 'AES-GCM', iv: decode(sealed.iv) }, wrapping, decode(sealed.wrapped));
  const key = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  new Uint8Array(raw).fill(0);
  // Safari は X25519 CryptoKey を IndexedDB に入れると行全体を読めなくなる。
  // コメント用の秘密鍵は、中身の鍵で暗号化したバイト列として覚える。平文では保存しない。
  const authBytes = new Uint8Array(await subtle.exportKey('pkcs8', privateKey));
  try {
    const auth = await subtle.importKey('pkcs8', authBytes, { name: 'X25519' }, false, ['deriveBits']);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const data = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('react-maker-preview-auth-v1') }, key, authBytes);
    return { key, auth, authWrapped: { iv, data } };
  } finally { authBytes.fill(0); }
}

export async function unlockContentKey(password, sealed) {
  return (await unlockWithAuth(password, sealed)).key;
}

/** コメントの受け付け先（編集GUIのサーバー）。https か、手元の http だけ */
export const commentsUrlPattern = /^(https:\/\/[^\s"'<>\\]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s"'<>\\]*)$/;

/** ファイルの中身を暗号化する。形：先頭12バイトが iv、続きが暗号文 */
export async function encryptBytes(key, bytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + data.length);
  out.set(iv); out.set(data, 12);
  return out;
}

export async function decryptBytes(key, bytes) {
  const data = new Uint8Array(bytes);
  return globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
}
