#!/usr/bin/env node
// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * データAPIのモックのサーバー（Issue #117）。src/generated/openapi.json と同じ形で、src/generated/project.json のダミーデータを返す。
 *   npm run mock:api                       # http://localhost:4010
 *   npm run mock:api -- --pattern=error    # empty・error・delay・long・missing・many
 * サイトを向けるには .env.local に VITE_DATA_API_URL=http://localhost:4010 を書く
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const arg = (name, fallback) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const port = Number(arg('port', process.env.PORT ?? 4010));
const pattern = arg('pattern', process.env.MOCK_PATTERN ?? '');
const project = JSON.parse(await readFile('src/generated/project.json', 'utf8'));
const contract = JSON.parse(await readFile('src/generated/contract.json', 'utf8'));

function recordsOf(dataset) {
  const source = project.datasets.find(({ id }) => id === dataset.id)?.records ?? [];
  let records = source.map((record) => ({ id: record.id, ...Object.fromEntries(dataset.fields.filter(({ id }) => Object.hasOwn(record.values, id)).map(({ id, key }) => [key, record.values[id]])) }));
  if (pattern === 'empty') records = [];
  if (pattern === 'long') records = records.map((record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'string' && key !== 'id' ? value.repeat(4) : value])));
  if (pattern === 'missing') records = records.map((record, index) => (index === 0 ? { id: record.id } : record));
  if (pattern === 'many' && records.length) records = Array.from({ length: 1000 }, (_, index) => ({ ...records[index % records.length], id: `mock-${index + 1}` }));
  return records;
}

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('content-type', 'application/json; charset=utf-8');
  const send = (status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); };
  if (pattern === 'delay') await new Promise((resolve) => setTimeout(resolve, 2000));
  if (pattern === 'error') return send(500, { message: '模擬の失敗です' });
  const [, root, key, id] = url.pathname.split('/');
  const dataset = root === 'datasets' && contract.datasets.find((item) => item.key === key);
  if (!dataset) return send(404, { message: '見つかりません' });
  let records = recordsOf(dataset);
  if (id) {
    const record = records.find((item) => item.id === decodeURIComponent(id));
    return record ? send(200, record) : send(404, { message: '見つかりません' });
  }
  for (const [name, value] of url.searchParams) {
    const match = /^filter\[(.+)\]$/.exec(name);
    if (match) records = records.filter((record) => String(record[match[1]]) === value);
  }
  const sort = url.searchParams.get('sort');
  if (sort) records = [...records].sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), 'ja', { numeric: true }) * (url.searchParams.get('order') === 'desc' ? -1 : 1));
  const size = Math.max(1, Math.min(500, Number(url.searchParams.get('pageSize') ?? 30)));
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  return send(200, { records: records.slice((page - 1) * size, page * size), total: records.length });
}).listen(port, () => console.log(`データAPIのモック：http://localhost:${port}${pattern ? `（パターン ${pattern}）` : ''}`));
