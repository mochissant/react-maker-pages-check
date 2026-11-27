// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
// react-maker が書き出した、画面の事前の描画（Issue #174）。npm run build の最後に実行する。
// 画面ごとの HTML（dist/…/index.html。#158）の #root に、その画面を描いた結果を入れる。JavaScript を切ったブラウザでも中身が読め、検索にも載る。
// 事前に描かない画面：データで変わる URL（詳細画面）、下書き。選んだ404画面も事前に描く（#236）
// 詳細画面で「行ごとのページ」を選んだときは、行ごとに、その行を選んだ状態で描く（#245。seo.json の records）
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
let pages = [];
try { pages = JSON.parse(await readFile(path.join(root, 'src/generated/seo.json'), 'utf8')); } catch { process.exit(0); }
const server = await createServer({ root, configFile: path.join(root, 'vite.config.js'), appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false }, base: process.env.SITE_BASE || '/' });
let rendered = 0;
try {
  const { renderScreenHtml } = await server.ssrLoadModule('/src/prerender.tsx');
  for (const { file, screenId, locale, records } of pages) {
    if (!screenId) continue;
    const target = path.join(dist, file);
    const html = await readFile(target, 'utf8').catch(() => null);
    if (!html || !html.includes('<div id="root"></div>')) continue;
    try {
      const body = renderScreenHtml(screenId, locale, records);
      if (!body) continue;
      await writeFile(target, html.replace('<div id="root"></div>', `<div id="root">${body}</div>`));
      rendered += 1;
    } catch (error) {
      // 事前に描けない画面は、今の形（クライアントで描く）のままにする
      console.warn(`画面 ${screenId} を事前に描けませんでした：${error.message}`);
    }
  }
} finally {
  await server.close();
}
console.log(`事前に描いた画面：${rendered}／${pages.length}`);
