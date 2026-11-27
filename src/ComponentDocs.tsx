// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 部品のドキュメントのページ（Issue #180。Storybook の Docs 相当）。編集の道具は出さず、読むためだけのページ。
 * - 目次：トークンと部品の一覧。部品ごと：説明（Markdown）・バリアントと状態の見本・プロパティの表・使っている画面・トークン・コードの例・動きの再生
 * - 見本の幅・背景・モード（ライト・ダークなど）を切り替えられる
 * - 書き出したサイトでは、閲覧用のURL（GitHub Pages の preview）の design-system/ に出す（site.tsx）。編集GUIでも同じものを読む
 * データは component-docs.js が作る（src/generated/component-docs.json）。見本の描き方は、呼ぶ側が renderSample で渡す
 */
import React, { useId, useState } from 'react';
import type { ReactNode } from 'react';
import './component-docs.css';

export type DocProperty = { name: string; type: string; defaultValue: string; description: string };
export type DocVariant = { id: string; name: string; label: string; axisValues?: Record<string, string> };
export type DocComponent = {
  id: string; slug: string; name: string; codeName: string; compatible: boolean; description: string; type: string;
  variants: DocVariant[]; axes: Array<{ id: string; name: string; values: string[] }>; properties: DocProperty[];
  usages: Array<{ screenId: string; name: string; count: number }>; tokens: Array<{ id: string; name: string; kind: string }>;
  motions: Array<{ part: string; trigger: string; effect: string }>; example: string;
};
export type ComponentDocsData = {
  format: 'react-maker-component-docs'; version: number; name: string;
  modes: Array<{ id: string; name: string; code?: string }>;
  tokens: Array<{ id: string; name: string; kind: string; group?: string; description?: string }>;
  components: DocComponent[];
};
export type SampleOptions = { width: number; replay: number; modeId: string };

type Props = {
  docs: ComponentDocsData;
  /** 開いている部品の slug。空なら目次 */
  slug: string;
  /** slug（空は目次）→ URL */
  hrefOf: (slug: string) => string;
  /** リンクを押したとき（ページを読み直さずに切り替える）。無ければ普通のリンク */
  onOpen?: (slug: string) => void;
  renderSample: (component: DocComponent, variant: DocVariant, options: SampleOptions) => ReactNode;
};

const widths = [{ value: 0, label: '内容に合わせる' }, { value: 390, label: 'スマホ（390px）' }, { value: 768, label: 'タブレット（768px）' }, { value: 1280, label: 'PC（1280px）' }];
const backgrounds: Record<string, string> = { white: '白', gray: '灰色', dark: '暗い色', checker: '市松模様' };
const triggers: Record<string, string> = { enter: '表示されたとき', exit: '消えるとき', hover: 'ホバー', press: '押したとき', scroll: 'スクロール', inView: '画面に入ったとき', loop: 'くり返し' };

/** 説明の Markdown（見出し・箇条書き・段落・`コード`・**太字**・リンク）。HTML は書けない（文字として出す） */
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    if (match[1] !== undefined) nodes.push(<code key={index}>{match[1]}</code>);
    else if (match[2] !== undefined) nodes.push(<strong key={index}>{match[2]}</strong>);
    else nodes.push(<a key={index} href={match[4]} target="_blank" rel="noreferrer">{match[3]}</a>);
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function DocMarkdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return <div className="rm-docs-markdown">{blocks.map((block, index) => {
    const lines = block.split('\n');
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      const Tag = (['h3', 'h4', 'h5'] as const)[heading[1].length - 1];
      return <Tag key={index}>{inline(heading[2])}</Tag>;
    }
    if (lines.every((line) => /^[-*]\s+/.test(line))) return <ul key={index}>{lines.map((line, item) => <li key={item}>{inline(line.replace(/^[-*]\s+/, ''))}</li>)}</ul>;
    return <p key={index}>{lines.map((line, item) => <React.Fragment key={item}>{item > 0 && <br />}{inline(line)}</React.Fragment>)}</p>;
  })}</div>;
}

function DocLink({ slug, hrefOf, onOpen, children }: { slug: string; hrefOf: Props['hrefOf']; onOpen?: Props['onOpen']; children: ReactNode }) {
  return <a href={hrefOf(slug)} onClick={onOpen ? (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onOpen(slug);
  } : undefined}>{children}</a>;
}

function Index({ docs, hrefOf, onOpen }: Pick<Props, 'docs' | 'hrefOf' | 'onOpen'>) {
  const groups = new Map<string, ComponentDocsData['tokens']>();
  for (const token of docs.tokens) groups.set(token.kind, [...(groups.get(token.kind) ?? []), token]);
  return <>
    <h1>{docs.name} のデザインシステム</h1>
    <section aria-labelledby="rm-docs-components">
      <h2 id="rm-docs-components">部品（{docs.components.length}）</h2>
      {docs.components.length ? <ul className="rm-docs-list">{docs.components.map((component) => <li key={component.id}>
        <DocLink slug={component.slug} hrefOf={hrefOf} onOpen={onOpen}>{component.name}</DocLink>
        <code>{component.codeName}</code>
        {component.description && <span>{component.description.split('\n')[0].replace(/^#+\s*/, '')}</span>}
      </li>)}</ul> : <p>まだ部品がありません。</p>}
    </section>
    <section aria-labelledby="rm-docs-tokens">
      <h2 id="rm-docs-tokens">トークン（{docs.tokens.length}）</h2>
      {[...groups].map(([kind, tokens]) => <details key={kind} open>
        <summary>{kind}（{tokens.length}）</summary>
        <ul className="rm-docs-list">{tokens.map((token) => <li key={token.id}><span>{token.name}</span>{token.group && <span>{token.group}</span>}{token.description && <span>{token.description}</span>}</li>)}</ul>
      </details>)}
    </section>
  </>;
}

function ComponentPage({ docs, component, hrefOf, onOpen, renderSample }: Omit<Props, 'slug'> & { component: DocComponent }) {
  const id = useId();
  const [width, setWidth] = useState(0);
  const [background, setBackground] = useState('white');
  const [mode, setMode] = useState('');
  const [replay, setReplay] = useState(0);
  const options = { width, replay, modeId: mode };
  const modeCode = docs.modes.find(({ id: modeId }) => modeId === mode)?.code;
  const [rowAxis, columnAxis] = component.axes;
  const variantAt = (row: string, column?: string) => component.variants.find(({ axisValues }) => axisValues?.[rowAxis.id] === row && (!columnAxis || axisValues?.[columnAxis.id] === column));
  const sample = (variant: DocVariant) => <div className="rm-docs-sample" data-background={background} data-mode={modeCode || undefined} style={width ? { width } : undefined}>
    {renderSample(component, variant, options)}</div>;
  return <>
    <p className="rm-docs-crumbs"><DocLink slug="" hrefOf={hrefOf} onOpen={onOpen}>{docs.name} のデザインシステム</DocLink> › {component.name}</p>
    <h1>{component.name}</h1>
    <p className="rm-docs-meta">コンポーネント名 <code>{component.codeName}</code>{!component.compatible && '（中身に動き・データ・操作があるので、書き出したサイトでは共通の描画で表示します）'}</p>
    {component.description ? <DocMarkdown source={component.description} /> : <p className="rm-docs-empty">説明はまだありません。</p>}

    <section aria-labelledby={`${id}-samples`}>
      <h2 id={`${id}-samples`}>見本</h2>
      <div className="rm-docs-controls" role="group" aria-label="見本の表示">
        <label>幅<select value={width} onChange={(event) => setWidth(Number(event.target.value))}>{widths.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>背景<select value={background} onChange={(event) => setBackground(event.target.value)}>{Object.entries(backgrounds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {docs.modes.length > 0 && <label>モード<select value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="">基本</option>{docs.modes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {component.motions.length > 0 && <button type="button" onClick={() => setReplay((count) => count + 1)}>動きを再生</button>}
      </div>
      {rowAxis ? <div className="rm-docs-matrix-scroll"><table className="rm-docs-matrix">
        <caption>{rowAxis.name}{columnAxis ? ` × ${columnAxis.name}` : ''}の組み合わせ</caption>
        <thead><tr><th scope="col">{rowAxis.name}</th>{columnAxis ? columnAxis.values.map((value) => <th key={value} scope="col">{value}</th>) : <th scope="col">見本</th>}</tr></thead>
        <tbody>{rowAxis.values.map((row) => <tr key={row}><th scope="row">{row}</th>
          {(columnAxis ? columnAxis.values : [undefined]).map((column) => {
            const variant = variantAt(row, column);
            return <td key={column ?? 'only'}>{variant ? sample(variant) : <span className="rm-docs-empty">なし</span>}</td>;
          })}</tr>)}</tbody>
      </table></div> : <ul className="rm-docs-variants">{component.variants.map((variant) => <li key={variant.id || 'base'}>
        <figure><figcaption>{variant.label}<code>{variant.name}</code></figcaption>{sample(variant)}</figure></li>)}</ul>}
      <p className="rm-docs-note">見本は押したりホバーしたりして、状態の変化を確かめられます。{width ? 'ブレークポイントは、閲覧している画面の幅で決まります。' : ''}</p>
    </section>

    <section aria-labelledby={`${id}-props`}>
      <h2 id={`${id}-props`}>プロパティ</h2>
      <div className="rm-docs-table-scroll"><table className="rm-docs-table">
        <thead><tr><th scope="col">名前</th><th scope="col">型</th><th scope="col">既定値</th><th scope="col">説明</th></tr></thead>
        <tbody>{component.properties.map((property) => <tr key={property.name}><th scope="row"><code>{property.name}</code></th><td><code>{property.type}</code></td>
          <td>{property.defaultValue ? <code>{property.defaultValue}</code> : '—'}</td><td>{property.description}</td></tr>)}</tbody>
      </table></div>
    </section>

    <section aria-labelledby={`${id}-code`}>
      <h2 id={`${id}-code`}>使い方</h2>
      <pre className="rm-docs-code"><code>{component.example}</code></pre>
    </section>

    {component.motions.length > 0 && <section aria-labelledby={`${id}-motion`}>
      <h2 id={`${id}-motion`}>動き</h2>
      <ul>{component.motions.map((motion, index) => <li key={index}>{motion.part}：{triggers[motion.trigger] ?? motion.trigger}{motion.effect ? `（${motion.effect}）` : ''}</li>)}</ul>
    </section>}

    <section aria-labelledby={`${id}-tokens`}>
      <h2 id={`${id}-tokens`}>使っているトークン</h2>
      {component.tokens.length ? <ul className="rm-docs-list">{component.tokens.map((token) => <li key={token.id}><span>{token.name}</span><span>{token.kind}</span></li>)}</ul>
        : <p className="rm-docs-empty">トークンを使っていません。</p>}
    </section>

    <section aria-labelledby={`${id}-usages`}>
      <h2 id={`${id}-usages`}>使っている画面</h2>
      {component.usages.length ? <ul>{component.usages.map((usage) => <li key={usage.screenId}>{usage.name}（{usage.count}か所）</li>)}</ul>
        : <p className="rm-docs-empty">まだ画面に置いていません。</p>}
    </section>
  </>;
}

export function ComponentDocs({ docs, slug, hrefOf, onOpen, renderSample }: Props) {
  const component = slug ? docs.components.find((item) => item.slug === slug) : undefined;
  return <article className="rm-docs" aria-label="デザインシステムのドキュメント">
    {component ? <ComponentPage key={component.id} docs={docs} component={component} hrefOf={hrefOf} onOpen={onOpen} renderSample={renderSample} />
      : slug ? <><h1>部品が見つかりません</h1><p><DocLink slug="" hrefOf={hrefOf} onOpen={onOpen}>目次へ</DocLink></p></>
        : <Index docs={docs} hrefOf={hrefOf} onOpen={onOpen} />}
  </article>;
}
