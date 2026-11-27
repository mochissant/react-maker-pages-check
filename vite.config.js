import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * 画面ごとのURL（/event-detail/rec-1 など）を直接開けるよう、配信先のパスを絶対パスで決める。
 * サブフォルダに置くときは SITE_BASE=/sub/ npm run build。
 * 静的ホスティングでは、存在しないパスに index.html を返す設定が要る（README の「画面ごとのURL」）。
 * GitHub Pages 向けに、選んだ404画面（未指定なら既定の案内）を 404.html に出力する。
 */

/**
 * 画面ごとの HTML（Issue #158・#174）。X・Facebook・Slack・LINE などのカードは JavaScript を実行しないので、
 * 画面のURLごとに、その画面のタイトル・説明・OGP を入れた index.html を作る（/pricing/index.html など）。中身の描画は今と同じく React が行う
 */
function screenPages() {
  let base = '/';
  return {
    name: 'react-maker-screen-pages',
    apply: 'build',
    configResolved(config) { base = config.base; },
    async writeBundle({ dir }, bundle) {
      const page = bundle['index.html'];
      if (page?.type !== 'asset' || !dir) return;
      let pages = [];
      try { pages = JSON.parse(await readFile(path.join(import.meta.dirname, 'src/generated/seo.json'), 'utf8')); } catch { /* 古い案件にも既定の404を残す */ }
      const escape = (text) => String(text).replace(/[&<>"']/g, (character) => `&#${character.codePointAt(0)};`);
      const renderPage = (source, { title, lang, head }) => (head.includes('name="theme-color"') ? source.replace(/<meta name="theme-color"[^>]*>/g, '') : source)
        .replace(/<!-- rm:seo -->[\s\S]*?<!-- \/rm:seo -->/, `<!-- rm:seo -->\n${head.replaceAll('%BASE_URL%', base)}\n    <!-- /rm:seo -->`)
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(title)}</title>`).replace(/<html lang="[^"]*">/, `<html lang="${escape(lang)}">`);
      // #263: project.json/seo.jsonをGitで更新した後は開始画面のheadも再生成する。
      const start = pages.find(({ file }) => file === 'index.html');
      const source = start ? renderPage(String(page.source), start) : String(page.source);
      // 同じフックで404も書き、rootのコピーと専用ページの上書きが競合しないようにする（#236）。
      if (!pages.some(({ file }) => file === '404.html')) {
        const icons = (source.match(/<(?:link|meta)\b[^>]*>/g) ?? []).filter((tag) => /rel="(?:icon|apple-touch-icon|manifest)"|name="theme-color"/.test(tag));
        const fallback = source.replace(/<!-- rm:seo -->[\s\S]*?<!-- \/rm:seo -->/, `<!-- rm:seo -->\n    <meta name="robots" content="noindex" />\n${icons.join('\n')}\n    <!-- /rm:seo -->`)
          .replace(/<title>[\s\S]*?<\/title>/, '<title>ページが見つかりません</title>');
        await writeFile(path.join(dir, '404.html'), fallback);
      }
      for (const page of pages) {
        const { file } = page;
        const html = renderPage(source, page);
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await writeFile(path.join(dir, file), html);
      }
    },
  };
}

// @/ は src/（取り込んだ部品が @/lib/utils・@/components/ui/… を読む。Issue #111）
export default defineConfig({
  base: process.env.SITE_BASE || '/', plugins: [tailwindcss(), screenPages()],
  resolve: { alias: [
    // Fluid のエンジンは src/vendor/usefluid-motion に同梱（Issue #112）
    { find: /^@usefluid\/motion\/react$/, replacement: path.resolve(import.meta.dirname, 'src/vendor/usefluid-motion/react.js') },
    { find: /^@usefluid\/motion$/, replacement: path.resolve(import.meta.dirname, 'src/vendor/usefluid-motion/index.js') },
    { find: /^@\//, replacement: `${path.resolve(import.meta.dirname, 'src')}/` },
  ] },
});
