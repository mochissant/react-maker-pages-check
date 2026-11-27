#!/usr/bin/env node
// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * GitHub Pages の gh-pages に、ビルドしたサイトを置く（Issue #168・#170）。書き出したリポジトリの scripts/deploy-pages.mjs。
 * ワークフロー（.github/workflows/publish-site.yml）から呼ぶ：
 *   node scripts/deploy-pages.mjs --mode <production|preview|revoke|revoke-branch> --dist dist --pages pages --root /<repo>/ [--id <id>] [--branch <name>] [--sha <sha>]
 * - production：本番の範囲（preview/ 以外）を、このビルドの中身で置き換える。消した画面・戻した版に無いファイルは残らない
 * - preview：preview/<id>/ を、このビルドで置き換える（発行した時点の版で固定。「最新の版に更新」で同じ id に置き直す）。
 *   すべての HTML に noindex を付け、robots.txt で preview/ を除く。環境変数 RM_PREVIEW_LOCK（公開鍵と塩）があれば、すべてのファイルを暗号化する
 * - revoke：preview/<id>/ を消す（取り消し）。revoke-branch：消したブランチから発行した閲覧用のURLを消す
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decryptBytes, encryptBytes, passwordKeyPair, sealContentKey, unlockWithAuth } from './pages-lock.mjs';

export const previewFolder = 'preview';
export const metaFile = 'rm-preview.json';
export const validPreviewId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);

async function filesIn(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(path)); else result.push(path);
  }
  return result;
}

/** HTML に noindex を付ける（すでにある robots の meta は置き換える） */
export function withNoindex(html) {
  const cleaned = html.replace(/<meta\s+name=["']robots["'][^>]*>\s*/gi, '');
  const tag = '<meta name="robots" content="noindex, nofollow">';
  return /<head[^>]*>/i.test(cleaned) ? cleaned.replace(/<head[^>]*>/i, (head) => `${head}\n    ${tag}`) : `${tag}\n${cleaned}`;
}

/** robots.txt で、閲覧用のURL（preview/）を検索エンジンから除く */
export async function ensureRobots(pages, root) {
  const path = join(pages, 'robots.txt');
  const rule = `Disallow: ${root}${previewFolder}/`;
  const current = await readFile(path, 'utf8').catch(() => '');
  if (current.split(/\r?\n/).some((line) => line.trim() === rule)) return;
  await writeFile(path, `${current.trimEnd()}${current.trim() ? '\n\n' : ''}User-agent: *\n${rule}\n`);
}

/** 本番：preview/ と .git 以外を消して、ビルドの中身を置く */
export async function deployProduction({ dist, pages, root }) {
  await mkdir(pages, { recursive: true });
  for (const entry of await readdir(pages)) {
    if (entry === '.git' || entry === previewFolder) continue;
    await rm(join(pages, entry), { recursive: true, force: true });
  }
  await cp(dist, pages, { recursive: true });
  await writeFile(join(pages, '.nojekyll'), '');
  await ensureRobots(pages, root);
}

/** 閲覧用のURL：preview/<id>/ を置き換える。lock があれば暗号化する */
export async function deployPreview({ dist, pages, root, id, branch = '', sha = '', lock = null, now = new Date() }) {
  if (!validPreviewId(id)) throw new Error(`閲覧用のURLの id が正しくありません：${id}`);
  const target = join(pages, previewFolder, id);
  const previous = JSON.parse(await readFile(join(target, metaFile), 'utf8').catch(() => 'null'));
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(dist, target, { recursive: true });
  for (const file of await filesIn(target)) if (file.endsWith('.html')) await writeFile(file, withNoindex(await readFile(file, 'utf8')));
  const base = `${root}${previewFolder}/${id}/`;
  if (lock) await lockFolder(target, lock, base);
  await writeFile(join(target, metaFile), `${JSON.stringify({ id, branch, sha, createdAt: previous?.createdAt ?? now.toISOString(), updatedAt: now.toISOString(), locked: Boolean(lock),
    ...(lock ? { lock: { v: lock.v, salt: lock.salt, iterations: lock.iterations, publicKey: lock.publicKey, ...(lock.comments ? { comments: lock.comments } : {}) } } : {}) }, null, 2)}\n`);
  await writeFile(join(pages, '.nojekyll'), '');
  await ensureRobots(pages, root);
  return base;
}

export async function revokePreview({ pages, id }) {
  if (!validPreviewId(id) && !/^[A-Za-z0-9._-]+$/.test(String(id))) throw new Error(`閲覧用のURLの id が正しくありません：${id}`);
  await rm(join(pages, previewFolder, id), { recursive: true, force: true });
}

/** 消したブランチから発行した閲覧用のURLを消す */
export async function revokeBranch({ pages, branch }) {
  const removed = [];
  for (const entry of await readdir(join(pages, previewFolder), { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const meta = JSON.parse(await readFile(join(pages, previewFolder, entry.name, metaFile), 'utf8').catch(() => 'null'));
    if (meta?.branch === branch) { await rm(join(pages, previewFolder, entry.name), { recursive: true, force: true }); removed.push(entry.name); }
  }
  return removed;
}

const contentTypes = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', txt: 'text/plain; charset=utf-8', xml: 'application/xml', webmanifest: 'application/manifest+json', mp4: 'video/mp4', webm: 'video/webm' };

/** 暗号化した閲覧用のURL：HTML はパスワードの入力欄だけのページに置き換え、元のファイルはすべて <パス>.rmenc に暗号化して置く */
export async function lockFolder(target, lock, base) {
  const { key, sealed } = await sealContentKey(lock);
  for (const file of await filesIn(target)) {
    const bytes = await readFile(file);
    await writeFile(`${file}.rmenc`, await encryptBytes(key, bytes));
    if (file.endsWith('.html')) await writeFile(file, lockPage(base));
    else await rm(file);
  }
  await mkdir(join(target, '__rm-lock'), { recursive: true });
  await writeFile(join(target, '__rm-lock', 'lock.json'), JSON.stringify(sealed));
  await writeFile(join(target, 'rm-lock-sw.js'), lockWorker());
}

/** パスワードの入力欄のページ（中身は含まない） */
export function lockPage(base) {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>パスワードを入れてください</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 1rem; background: Canvas; color: CanvasText; }
      form { display: grid; gap: 0.75rem; width: min(100%, 22rem); }
      h1 { font-size: 1.25rem; margin: 0; }
      p { margin: 0; font-size: 0.875rem; line-height: 1.6; }
      input, button { font: inherit; padding: 0.625rem 0.75rem; border-radius: 0.5rem; border: 1px solid GrayText; }
      button { background: CanvasText; color: Canvas; cursor: pointer; }
      [role="alert"]:empty { display: none; }
    </style>
  </head>
  <body>
    <form id="rm-lock">
      <h1>この閲覧用のページには、パスワードがかかっています</h1>
      <p>共有した人から聞いたパスワードを入れてください。このブラウザでは、7日間は聞きません。</p>
      <label for="rm-password">パスワード</label>
      <input id="rm-password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">開く</button>
      <p role="alert" id="rm-message"></p>
    </form>
    <script type="module">
${[passwordKeyPair, unlockWithAuth].map(String).join('\n')}
const base = ${JSON.stringify(base)};
const message = document.getElementById('rm-message');
function store({ key, authWrapped }) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('rm-lock', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('keys', 'readwrite');
      transaction.objectStore('keys').put({ key, authWrapped, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 }, base);
      transaction.oncomplete = () => {
        // 保存に成功したように見えても読み戻せない場合は、再読み込みのループにしない。
        const get = db.transaction('keys').objectStore('keys').get(base);
        get.onsuccess = () => {
          db.close();
          if (get.result?.key && get.result?.authWrapped) resolve();
          else reject(Object.assign(new Error('storage'), { name: 'DataCloneError' }));
        };
        get.onerror = () => { db.close(); reject(get.error); };
      };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}
document.getElementById('rm-lock').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  message.textContent = '確かめています…';
  try {
    if (!globalThis.crypto?.subtle || !('serviceWorker' in navigator) || !globalThis.indexedDB) throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
    const sealed = await (await fetch(base + '__rm-lock/lock.json', { cache: 'no-store' })).json();
    await store(await unlockWithAuth(document.getElementById('rm-password').value, sealed));
    await navigator.serviceWorker.register(base + 'rm-lock-sw.js', { scope: base });
    await navigator.serviceWorker.ready;
    location.reload();
  } catch (error) {
    message.textContent = error.name === 'NotSupportedError' ? 'このブラウザでは開けません。最新の Chrome・Edge・Firefox・Safari で開いてください。'
      : error.name === 'DataCloneError' ? 'このブラウザで鍵を保存できませんでした。別のブラウザで開いてください。'
      : error.name === 'OperationError' ? 'パスワードが違います。'
      : 'ページを開く準備ができませんでした。もう一度「開く」を押してください。';
    button.disabled = false;
  }
});
    </script>
  </body>
</html>
`;
}

/** 暗号化したファイルを、そのブラウザで復号して返す Service Worker */
export function lockWorker() {
  return `// react-maker の閲覧用のURLのパスワード（Issue #168）。覚えた鍵で <パス>.rmenc を復号して返す
${String(decryptBytes)}
const base = new URL('./', self.location).pathname;
const types = ${JSON.stringify(contentTypes)};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
function loadKey() {
  return new Promise((resolve) => {
    const request = indexedDB.open('rm-lock', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const get = request.result.transaction('keys').objectStore('keys').get(base);
      get.onsuccess = () => resolve(get.result && get.result.expires > Date.now() ? get.result.key : null);
      get.onerror = () => resolve(null);
    };
  });
}
async function encrypted(path, navigate) {
  const candidates = [path.endsWith('/') ? path + 'index.html' : path];
  if (navigate && !path.endsWith('/') && !/\\.[a-z0-9]+$/i.test(path)) candidates.push(path + '/index.html', path + '.html');
  if (navigate) candidates.push(base + '404.html');
  for (const candidate of candidates) {
    const response = await fetch(candidate + '.rmenc', { cache: 'no-cache' });
    if (response.ok) return { path: candidate, response, missing: candidate === base + '404.html' && candidates.length > 1 };
  }
  return null;
}
async function serve(request, url) {
  const key = await loadKey();
  if (!key) return fetch(request);
  const found = await encrypted(url.pathname, request.mode === 'navigate');
  if (!found) return fetch(request);
  try {
    const body = await decryptBytes(key, await found.response.arrayBuffer());
    const extension = (found.path.split('.').pop() || '').toLowerCase();
    return new Response(body, { status: found.missing ? 404 : 200, headers: { 'Content-Type': types[extension] || 'application/octet-stream' } });
  } catch {
    return fetch(request);
  }
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(base)) return;
  if (url.pathname.startsWith(base + '__rm-lock/') || url.pathname === base + 'rm-lock-sw.js' || url.pathname.endsWith('.rmenc')) return;
  event.respondWith(serve(event.request, url));
});
`;
}

/** コマンドラインから使う */
async function main(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) options[argv[index].replace(/^--/, '')] = argv[index + 1] ?? '';
  const pages = options.pages || 'pages';
  const root = options.root || '/';
  if (options.mode === 'production') await deployProduction({ dist: options.dist || 'dist', pages, root });
  else if (options.mode === 'preview') {
    const lock = process.env.RM_PREVIEW_LOCK ? JSON.parse(process.env.RM_PREVIEW_LOCK) : null;
    const base = await deployPreview({ dist: options.dist || 'dist', pages, root, id: options.id, branch: options.branch, sha: options.sha, lock });
    console.log(`閲覧用のURL：${base}${lock ? '（パスワードあり）' : ''}`);
  } else if (options.mode === 'revoke') await revokePreview({ pages, id: options.id });
  else if (options.mode === 'revoke-branch') console.log(`消した閲覧用のURL：${(await revokeBranch({ pages, branch: options.branch })).join('、') || 'なし'}`);
  else throw new Error(`--mode を確かめてください：${options.mode}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });
}

