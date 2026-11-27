import type { ComponentType } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentDataset, CustomComponentContext } from '../site-types';
import { ComponentEnvironmentProvider } from './component-runtime';
import type { PreviewCondition } from './component-runtime';
import { FieldView, FormView, fieldFormats, fieldKinds, validateTimings } from './forms';
import { LottieView, lottieTriggers } from './lottie';
import { Backdrop, backdropModes } from './backdrop';
import { MenuPart, PopoverPart, SliderPart, TooltipPart } from './radix-parts';
import { siteConfig } from '../site-config.ts';
import { localeFromPath, localeList, localizedRoot } from '../i18n.ts';
import { useOverlayLifecycle } from '../useOverlayLifecycle.ts';

/**
 * プロパティの型（Issue #110）：文字・数値・真偽値・選択肢（select）・色（color）・画像（image）・データ一覧（dataset）。
 * 選択肢は設定パネルでプルダウン、色はカラーピッカー、画像はライブラリから選べる
 */
/** controlled：部品の中で変わる値（値と、値を変える通知の組。Issue #242）。画面の状態とつなげる */
type ScalarField =
  | { label: string; type: 'text'; initial: string; controlled?: boolean }
  | { label: string; type: 'number'; initial: number; controlled?: boolean }
  | { label: string; type: 'boolean'; initial: boolean; controlled?: boolean }
  | { label: string; type: 'select'; options: readonly string[]; initial: string; controlled?: boolean }
  | { label: string; type: 'color'; initial: string }
  | { label: string; type: 'image'; initial: string };
type Field = ScalarField | { label: string; type: 'dataset' };
type Fields = Record<string, Field>;
type Values<T extends Fields> = {
  [K in keyof T]: T[K]['type'] extends 'dataset'
    ? ComponentDataset | null
    : Extract<ScalarField, { type: T[K]['type'] }>['initial'];
};

export function defineComponent<T extends Fields>(label: string, fields: T,
  Component: ComponentType<CustomComponentContext & { values: Values<T> }>,
  actions: Readonly<Record<string, string | { label: string; unknown?: boolean; empty?: boolean; invalid?: boolean; success?: boolean }>> = {}) {
  function View({ values, datasetsById, assetUrls, preview = false, conditions = {}, ...context }: CustomComponentContext & {
    values: Record<string, unknown>;
    datasetsById?: ReadonlyMap<string, ComponentDataset>;
    assetUrls?: Readonly<Record<string, string>>;
    preview?: boolean;
    conditions?: Partial<Record<string, PreviewCondition>>;
  }) {
    const props = Object.fromEntries(Object.entries(fields).map(([id, field]) => {
      const value = Object.hasOwn(values, id) ? values[id] : undefined;
      if (field.type === 'dataset') {
        return [id, typeof value === 'string' ? datasetsById?.get(value) ?? null : null];
      }
      const { initial } = field;
      // 選択肢は前後の空白を許す（手で書いた案件データ・コードの部品の値。Issue #270）
      const choice = field.type === 'select' && typeof value === 'string' ? value.trim() : value;
      const valid = typeof choice === typeof initial && (typeof choice !== 'number' || Number.isFinite(choice))
        && (field.type !== 'select' || field.options.includes(choice as string))
        && (field.type !== 'color' || /^(#[0-9a-f]{6}([0-9a-f]{2})?|(rgba?|hsla?|oklch)\([0-9\s.,%/+-]+\))$/i.test(choice as string));
      const resolved = valid ? choice : initial;
      // 画像：ライブラリの素材（asset:<id>）は表示用のURLに、それ以外は https と同じサイト内のパスだけを通す
      if (field.type === 'image') return [id, imageSource(resolved as string, assetUrls)];
      return [id, resolved];
    })) as Values<T>;
    return <ComponentEnvironmentProvider preview={preview} interactive={context.interactive} conditions={conditions}>
      <Component {...context} values={props} />
    </ComponentEnvironmentProvider>;
  }
  return { label, fields, actions, View };
}

function imageSource(value: string, assetUrls?: Readonly<Record<string, string>>) {
  if (value.startsWith('asset:')) return assetUrls?.[value.slice('asset:'.length)] ?? '';
  return /^(https:\/\/|\/(?!\/)|\.\/)/.test(value) ? value : '';
}

/** 文字列の値を選択肢に収める（select 型は defineComponent で範囲外を既定値に戻すが、部品の中でも念のため確かめる）。古いデータ向け、選択肢は文字列で受け取り、範囲外なら既定値に戻す */
function oneOf<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value.trim()) ? value.trim() as T : fallback;
}

const menuSides = ['左', '右'] as const;

/** 部品を置いた文書（編集プレビューはiframe）の画面幅が minWidth 以上か */
function useWideEnough(element: { current: HTMLElement | null }, minWidth: number) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const view = element.current?.ownerDocument.defaultView;
    if (!view || minWidth <= 0) { setWide(false); return undefined; }
    const query = view.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [element, minWidth]);
  return wide;
}

/**
 * 開閉できるサイドメニュー（Issue #42）。中に置いた要素（ボタンなど）がメニューの項目になり、項目の遷移先は各要素で設定する。
 * - 開閉は画面の中の状態で、画面の遷移ではない。項目を押したときの遷移とは別に扱う
 * - 重ねて出すときはモーダル（ネイティブの dialog の showModal）：背面は操作できず、Escape・閉じるボタンで閉じ、開くボタンへフォーカスを戻す
 * - 「常に表示する画面幅」以上では、開閉せずに通常のナビゲーション（nav）として置く
 * - 編集中は、項目を選んで編集できるよう、メニューの中身を開いた形で表示する
 */
function SideMenu({ values: { title, openLabel, closeLabel, side, pinnedFrom }, children, interactive }: CustomComponentContext & {
  values: { title: string; openLabel: string; closeLabel: string; side: string; pinnedFrom: number };
}) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const menuPanel = useRef<HTMLElement>(null);
  const [opened, setOpened] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const name = title.trim() || 'メニュー';
  const pinned = useWideEnough(root, Math.max(0, pinnedFrom));
  const position = oneOf(side, menuSides, '左');
  useOverlayLifecycle(dialog, { enabled: opened && interactive && !pinned, modal: true, dismissArea: menuPanel, restoreFocus: opener.current, onDismiss: () => setOpened(false) });
  useEffect(() => { if (pinned || !interactive) setOpened(false); }, [pinned, interactive]);

  function close() {
    setOpened(false);
  }

  if (!interactive) {
    return <div ref={root} className="rm-part-menu" data-editing="">
      <button type="button" className="rm-part-menu-open" tabIndex={-1}>{openLabel.trim() || name}</button>
      <nav className="rm-part-menu-panel" aria-label={name}>
        <p className="rm-part-menu-title">{name}</p>
        <div className="rm-part-menu-items">{children}</div>
      </nav>
    </div>;
  }
  if (pinned) {
    return <div ref={root} className="rm-part-menu">
      <nav className="rm-part-menu-panel" aria-label={name}>
        <p className="rm-part-menu-title">{name}</p>
        <div className="rm-part-menu-items">{children}</div>
      </nav>
    </div>;
  }
  return <div ref={root} className="rm-part-menu">
    <button ref={opener} type="button" className="rm-part-menu-open" aria-haspopup="dialog"
      onClick={() => setOpened(true)}>{openLabel.trim() || name}</button>
    <dialog ref={dialog} className="rm-part-menu-dialog" data-side={position} aria-labelledby={titleId}
      onClose={() => setOpened(false)}>
      <nav ref={menuPanel} className="rm-part-menu-panel" aria-labelledby={titleId}>
        <div className="rm-part-menu-header">
          <h2 id={titleId} className="rm-part-menu-title">{name}</h2>
          <button type="button" className="rm-part-menu-close" onClick={close}>{closeLabel.trim() || '閉じる'}</button>
        </div>
        {/* 項目（中に置いたボタン）を押したら閉じる。遷移は項目ごとの設定で行う */}
        <div className="rm-part-menu-items" onClick={(event) => {
          if ((event.target as HTMLElement).closest('button, a')) close();
        }}>{children}</div>
      </nav>
    </dialog>
  </div>;
}

const listOf = (text: string) => text.split(/[、,\n]/).map((item) => item.trim()).filter(Boolean);
const hasChildren = (children: unknown) => Array.isArray(children) ? children.length > 0 : Boolean(children);
const badgeTones = ['標準', '情報', '完了', '注意', 'エラー'] as const;
const noticeTones = ['情報', '完了', '注意', 'エラー'] as const;

/**
 * どの案件でも使える汎用部品。見た目は src/preview.css の .rm-part-* で、プレビューと書き出しで同じものを使う。
 * 文字色・背景・余白などはGUIの要素設定（トークンを含む）が外側に効き、部品は文字色（currentColor）を受け継ぐ。
 */
/** childless：GUIで中に要素を置かない部品（置いた要素を表示しないため） */
const generic = <T extends object>(definition: T, childless = false) => ({ ...definition, generic: true as const, childless });

export const genericComponents = {
  card: generic(defineComponent('カード', {
    title: { label: '見出し', type: 'text', initial: 'カードの見出し' },
    description: { label: '本文', type: 'text', initial: 'カードの本文です。' },
    level: { label: '見出しのレベル（2〜4）', type: 'number', initial: 2 },
    outlined: { label: '枠線', type: 'boolean', initial: true },
    image: { label: '画像（空なら無し）', type: 'image', initial: '' },
  }, function Card({ values: { title, description, level, outlined, image }, children }) {
    const Heading = (['h2', 'h3', 'h4'] as const)[Math.min(Math.max(Math.round(level), 2), 4) - 2];
    return <article className="rm-part-card" data-outlined={outlined || undefined}>
      {image && <img className="rm-part-card-image" src={image} alt="" loading="lazy" decoding="async" />}
      {title.trim() && <Heading className="rm-part-card-title">{title}</Heading>}
      {description.trim() && <p className="rm-part-card-text">{description}</p>}
      {hasChildren(children) && <div className="rm-part-card-body">{children}</div>}
    </article>;
  })),
  badge: generic(defineComponent('バッジ', {
    label: { label: '文言', type: 'text', initial: '新着' },
    tone: { label: '種類', type: 'select', options: badgeTones, initial: '標準' },
  }, function Badge({ values: { label, tone } }) {
    return <span className="rm-part-badge" data-tone={oneOf(tone, badgeTones, '標準')}>{label.trim() || 'バッジ'}</span>;
  }), true),
  separator: generic(defineComponent('区切り線', {
    label: { label: '区切りの文言（空なら線だけ）', type: 'text', initial: '' },
  }, function Separator({ values: { label } }) {
    const text = label.trim();
    return text ? <div className="rm-part-separator" role="separator" aria-label={text}><span aria-hidden="true">{text}</span></div>
      : <hr className="rm-part-separator" />;
  }), true),
  notice: generic(defineComponent('通知', {
    title: { label: '見出し', type: 'text', initial: 'お知らせ' },
    message: { label: '本文', type: 'text', initial: '内容を確認してください。' },
    tone: { label: '種類', type: 'select', options: noticeTones, initial: '情報' },
  }, function Notice({ values: { title, message, tone }, children }) {
    const kind = oneOf(tone, noticeTones, '情報');
    return <div className="rm-part-notice" role="note" data-tone={kind}>
      <p className="rm-part-notice-title"><span className="rm-part-notice-kind">{kind}</span>{title.trim() && <strong>{title}</strong>}</p>
      {message.trim() && <p className="rm-part-notice-text">{message}</p>}
      {hasChildren(children) && <div>{children}</div>}
    </div>;
  })),
  'text-input': generic(defineComponent('テキスト入力', {
    label: { label: '項目名', type: 'text', initial: 'お名前' },
    hint: { label: '説明', type: 'text', initial: '' },
    placeholder: { label: '入力例', type: 'text', initial: '' },
    required: { label: '必須', type: 'boolean', initial: false },
    multiline: { label: '複数行', type: 'boolean', initial: false },
  }, function TextInput({ values: { label, hint, placeholder, required, multiline }, interactive }) {
    const id = useId();
    const [value, setValue] = useState('');
    const props = {
      id, className: 'rm-part-input', value, placeholder: placeholder.trim() || undefined, required,
      readOnly: !interactive, 'aria-describedby': hint.trim() ? `${id}-hint` : undefined,
      onChange: ({ target }: { target: { value: string } }) => setValue(target.value),
    };
    return <div className="rm-part-field">
      <label htmlFor={id} className="rm-part-label">{label.trim() || '入力'}{required && <span className="rm-part-required">（必須）</span>}</label>
      {hint.trim() && <p id={`${id}-hint`} className="rm-part-hint">{hint}</p>}
      {multiline ? <textarea rows={4} {...props} /> : <input type="text" {...props} />}
    </div>;
  }), true),
  // フォーム（Issue #118）：中に「入力項目」を置き、まとめて送信する。送信は form-api.ts の submitForm
  form: { ...generic(defineComponent('フォーム', {
    name: { label: '送信の名前（submitForm に渡す）', type: 'text', initial: 'contact' },
    submitLabel: { label: '送信ボタンの文言', type: 'text', initial: '送信する' },
    timing: { label: '誤りを出すとき', type: 'select', options: validateTimings, initial: '送信時' },
  }, function Form({ values: { name, submitLabel, timing }, children, interactive, statusMessages, onActivate }) {
    return <FormView name={name} submitLabel={submitLabel} timing={timing as typeof validateTimings[number]} statusMessages={statusMessages} interactive={interactive} onSuccess={onActivate}>{children}</FormView>;
  }, { submit: { label: '送信', unknown: true, empty: false, invalid: true, success: true } })), statusStates: ['pending', 'error', 'success'] as const },
  'form-field': generic(defineComponent('入力項目', {
    label: { label: '項目名', type: 'text', initial: 'お名前' },
    kind: { label: '種類', type: 'select', options: fieldKinds, initial: 'テキスト' },
    name: { label: '送信の項目名（空なら項目名）', type: 'text', initial: '' },
    required: { label: '必須', type: 'boolean', initial: true },
    hint: { label: '説明', type: 'text', initial: '' },
    placeholder: { label: '入力例', type: 'text', initial: '' },
    options: { label: '選択肢（「、」か改行で区切る）', type: 'text', initial: '' },
    format: { label: '形式', type: 'select', options: fieldFormats, initial: 'なし' },
    minLength: { label: '最小の文字数（0なら指定なし）', type: 'number', initial: 0 },
    maxLength: { label: '最大の文字数（0なら指定なし）', type: 'number', initial: 0 },
    min: { label: '数値の最小（最小・最大とも0なら指定なし）', type: 'number', initial: 0 },
    max: { label: '数値の最大', type: 'number', initial: 0 },
  }, function FormField({ values }) {
    return <FieldView {...values} />;
  }), true),
  // Lottie（Issue #113）：ベクターのアニメーションを再生する。JSON は URL（https:// か、サイトの中のパス）
  lottie: generic(defineComponent('Lottie', {
    src: { label: 'Lottie の JSON の URL', type: 'text', initial: '' },
    trigger: { label: '再生のきっかけ', type: 'select', options: lottieTriggers, initial: '見えたら' },
    loop: { label: '繰り返す', type: 'boolean', initial: false },
    label: { label: '内容の説明（空なら飾り）', type: 'text', initial: '' },
  }, function Lottie({ values: { src, trigger, loop, label }, interactive }) {
    return <LottieView src={src} trigger={trigger} loop={loop} label={label} interactive={interactive} />;
  }), true),
  // 重ねて出す・入力（Issue #154。Radix）。編集中は開かず、操作モードと書き出したサイトで開く
  tooltip: generic(defineComponent('ツールチップ', {
    label: { label: 'きっかけの文言', type: 'text', initial: '？' },
    text: { label: '説明', type: 'text', initial: '補足の説明を書きます。' },
  }, function TooltipView({ values: { label, text }, interactive }) {
    return <TooltipPart label={label} text={text} interactive={interactive} />;
  }), true),
  popover: generic(defineComponent('ポップオーバー', {
    label: { label: '開くボタンの文言', type: 'text', initial: '詳しく' },
    title: { label: '見出し', type: 'text', initial: '詳しい説明' },
    text: { label: '本文', type: 'text', initial: '押すと、その場に重ねて出します。' },
  }, function PopoverView({ values: { label, title, text }, interactive, children }) {
    return <PopoverPart label={label} title={title} text={text} interactive={interactive}>{children}</PopoverPart>;
  })),
  'dropdown-menu': generic(defineComponent('ドロップダウンメニュー', {
    label: { label: 'ボタンの文言', type: 'text', initial: 'メニュー' },
    items: { label: '項目（「、」か改行で区切る）', type: 'text', initial: '編集、複製、削除' },
  }, function MenuView({ values: { label, items }, interactive }) {
    return <MenuPart label={label} items={listOf(items)} interactive={interactive} />;
  }), true),
  slider: generic(defineComponent('スライダー', {
    label: { label: '項目名', type: 'text', initial: '音量' },
    min: { label: '最小', type: 'number', initial: 0 },
    max: { label: '最大', type: 'number', initial: 100 },
    step: { label: '刻み', type: 'number', initial: 1 },
    initial: { label: '最初の値', type: 'number', initial: 50 },
    unit: { label: '単位', type: 'text', initial: '' },
  }, function SliderView({ values }) {
    return <SliderPart {...values} />;
  }), true),
  // 言語の切り替え（Issue #182）：書き出したサイトで、設定した言語の同じ画面へのリンクを並べる
  'language-switcher': generic(defineComponent('言語の切り替え', {
    label: { label: '読み上げの名前', type: 'text', initial: '言語' },
  }, function LanguageSwitcher({ values: { label }, interactive }) {
    const { locales, locale, basePath = '/' } = siteConfig();
    const list = localeList(locales);
    // 言語が1つだけ（足していない）なら、サイトには何も出さない。編集中は、足し方の案内だけ（中身の無い名前付きの要素を作らない。Issue #270）
    if (!list.length) return interactive ? null : <span className="rm-part-language">言語の切り替え（言語を足すと並びます）</span>;
    const current = typeof location === 'undefined' ? basePath : location.pathname;
    const root = localeFromPath(current, basePath, locales).root;
    const rest = current.startsWith(root) ? current.slice(root.length) : '';
    return <nav className="rm-part-language" aria-label={label || '言語'}><ul>{list.map(({ code, name }) => <li key={code}>
      <a href={`${localizedRoot(basePath, code, locales)}${rest}`} hrefLang={code} lang={code} aria-current={code === locale ? 'true' : undefined}>{name}</a></li>)}</ul></nav>;
  }), true),
  // 表示（Issue #154）
  avatar: generic(defineComponent('アバター', {
    name: { label: '名前', type: 'text', initial: '山田 花子' },
    image: { label: '画像（空なら頭文字）', type: 'image', initial: '' },
    size: { label: '大きさ（px）', type: 'number', initial: 40 },
  }, function Avatar({ values: { name, image, size } }) {
    const length = Math.min(Math.max(Math.round(size), 16), 160);
    return <span className="rm-part-avatar" style={{ width: length, height: length, fontSize: length * 0.4 }} role="img" aria-label={name.trim() || '利用者'}>
      {image ? <img src={image} alt="" width={length} height={length} loading="lazy" decoding="async" /> : <span aria-hidden="true">{[...name.trim()][0] ?? '？'}</span>}
    </span>;
  }), true),
  rating: generic(defineComponent('評価の星', {
    value: { label: '評価', type: 'number', initial: 4 },
    max: { label: '星の数', type: 'number', initial: 5 },
  }, function Rating({ values: { value, max } }) {
    const total = Math.min(Math.max(Math.round(max), 1), 10);
    const current = Math.min(Math.max(value, 0), total);
    return <span className="rm-part-rating" role="img" aria-label={`${total}点中${current}点`}>
      {Array.from({ length: total }, (_, index) => <span key={index} aria-hidden="true" data-filled={index < Math.round(current) || undefined}>★</span>)}
    </span>;
  }), true),
  breadcrumb: generic(defineComponent('パンくず', {
    items: { label: '階層（「、」か改行で区切る。最後が今の画面）', type: 'text', initial: 'ホーム、お知らせ、記事' },
  }, function Breadcrumb({ values: { items } }) {
    const list = listOf(items);
    return <nav className="rm-part-breadcrumb" aria-label="パンくず"><ol>{list.map((item, index) => <li key={`${item}-${index}`} aria-current={index === list.length - 1 ? 'page' : undefined}>{item}</li>)}</ol></nav>;
  }), true),
  pagination: generic(defineComponent('ページ送り', {
    total: { label: 'ページの数', type: 'number', initial: 5 },
    current: { label: '最初のページ', type: 'number', initial: 1 },
  }, function Pagination({ values: { total, current } }) {
    const pages = Math.min(Math.max(Math.round(total), 1), 50);
    const [page, setPage] = useState(() => Math.min(Math.max(Math.round(current), 1), pages));
    return <nav className="rm-part-pagination" aria-label="ページ送り"><ul>
      <li><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="前のページ">‹</button></li>
      {Array.from({ length: pages }, (_, index) => index + 1).map((number) => <li key={number}><button type="button" aria-current={number === page ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button></li>)}
      <li><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="次のページ">›</button></li>
    </ul></nav>;
  }), true),
  // 背景（Issue #120）：動くグラデーション・ノイズ・粒子。中に置いた要素が上に重なる
  backdrop: generic(defineComponent('背景', {
    mode: { label: '種類', type: 'select', options: backdropModes, initial: 'グラデーションの動き' },
    color1: { label: '色1', type: 'color', initial: '#3546ba' },
    color2: { label: '色2', type: 'color', initial: '#7c3aed' },
  }, function BackdropPart({ values: { mode, color1, color2 }, interactive, children }) {
    return <Backdrop mode={mode} color1={color1} color2={color2} interactive={interactive}>{children}</Backdrop>;
  })),
  'side-menu': generic(defineComponent('サイドメニュー', {
    title: { label: 'メニューの名前', type: 'text', initial: 'メニュー' },
    openLabel: { label: '開くボタンの文言', type: 'text', initial: 'メニューを開く' },
    closeLabel: { label: '閉じるボタンの文言', type: 'text', initial: '閉じる' },
    side: { label: `出る位置（${menuSides.join('・')}）`, type: 'text', initial: '左' },
    pinnedFrom: { label: '常に表示する画面幅（px以上、0なら常に開閉）', type: 'number', initial: 0 },
  }, SideMenu)),
};

export const customComponents = {
  ...genericComponents,
};
