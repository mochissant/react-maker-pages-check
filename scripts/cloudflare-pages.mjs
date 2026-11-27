// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
// react-maker が書き出した、Cloudflare Pages 向けの仕上げ（Issue #250）。`npm run build:cloudflare` の最後に実行する。
// Cloudflare Pages では、_redirects のリダイレクトが、同じパスのファイルより先に効く（公式の説明：
// https://developers.cloudflare.com/pages/configuration/redirects/ 「Redirects are always followed, regardless of whether or not an asset matches」）。
// そのため、ほかの静的ホスティング向けの「すべてを index.html へ」（/* /index.html 200）は外す。
// 直接開いた URL は、事前に描いた画面ごとの HTML か、404.html（同じアプリを読み込み、URL から画面を決める）で表示する。
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '..', 'dist');
const redirects = path.join(dist, '_redirects');
const text = await readFile(redirects, 'utf8').catch(() => null);
if (text !== null) {
  const kept = text.split('\n').filter((line) => line.trim() && !/^\/\*\s+\/index\.html\s+200\s*$/.test(line.trim()));
  if (kept.length) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(redirects, `${kept.join('\n')}\n`);
  } else await rm(redirects);
}
if (!await stat(path.join(dist, '404.html')).catch(() => null)) {
  console.error('dist/404.html がありません。直接開いた URL を表示できないので、npm run build を確かめてください。');
  process.exit(1);
}
console.log('Cloudflare Pages 向けに仕上げました（_redirects の「すべてを index.html へ」を外し、404.html で表示します）。');
