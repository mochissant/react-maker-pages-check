#!/usr/bin/env node
// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * react-maker のコマンド（Issue #116）。ブラウザを使わずに、プロジェクトのファイルを確かめる。
 *   react-maker check [ファイル] [--json]
 * ファイルは src/generated/project.json（書き出したリポジトリ）か、編集用バックアップ。既定は src/generated/project.json
 * 要修正が1件でもあれば終了コード 1。--json で機械が読める結果を出す
 */
import { readFile } from 'node:fs/promises';
import { formatLint, lintProject } from './project-lint.js';

const [command = 'help', ...rest] = process.argv.slice(2);
const json = rest.includes('--json');
const file = rest.find((arg) => !arg.startsWith('--')) ?? 'src/generated/project.json';

if (command !== 'check') {
  console.log('使い方：react-maker check [src/generated/project.json] [--json]');
  process.exit(command === 'help' || command === '--help' ? 0 : 2);
}

let source;
try {
  source = JSON.parse(await readFile(file, 'utf8'));
} catch (problem) {
  const result = { ok: false, errors: [{ code: 'read', path: '', message: `${file} を JSON として読めません：${problem.message}` }], warnings: [] };
  console.log(json ? JSON.stringify(result, null, 2) : formatLint(result));
  process.exit(1);
}
const result = lintProject(source);
console.log(json ? JSON.stringify({ file, ...result }, null, 2) : formatLint(result));
process.exit(result.ok ? 0 : 1);
