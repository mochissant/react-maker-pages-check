// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { ControlSettings } from './controls.ts';
import type { ComboboxPart, ComboboxSettings } from './combobox.ts';

/**
 * 案件データ（project.json）の型（Issue #137）。編集GUIと書き出したサイトの共有ランタイムが同じ形を使う。
 * 値は利用者や AI が直接書き換えることがあるので、型は「こう書かれているはず」の形で、実行時の検証（tokenValue など）は残す
 */

/** スタイルの値。数値は px（単位を持たないプロパティは数値のまま） */
export type StyleValue = string | number | boolean | null | undefined | GradientValue | string[];
export type Style = { [property: string]: StyleValue };
/** スタイルのプロパティ → トークンのID */
export type TokenRefs = { [property: string]: string | null | undefined };
/** 幅の区切りのID → その幅以上で上書きするスタイル */
export type ResponsiveValues = { [breakpointId: string]: Style | undefined };

export type GradientStop = { color: string; position?: number };
export type GradientValue = { type?: 'linear' | 'radial' | 'conic'; angle?: number; stops: GradientStop[] };

export type ElementStateId = 'hover' | 'active' | 'focus' | 'disabled' | 'checked' | 'current';
export type ElementStates = { [state: string]: { style?: Style; tokenRefs?: TokenRefs } | undefined };
export type StateTransition = { duration?: number; easing?: string };

/** 動きの効果。rotateX・rotateY・z は 3D（Issue #233。遠近を付けて動かす） */
export type MotionEffect = { opacity?: number; x?: number; y?: number; scale?: number; rotate?: number; blur?: number; rotateX?: number; rotateY?: number; z?: number };
export type SpringSettings = { stiffness: number; damping: number; mass: number };
/** 道筋に沿った動き（Issue #161。motion-path.ts）。座標は要素の左上の止まっている位置からのずれ（px）。in・out は前後の制御点 */
export type MotionPathPoint = { x: number; y: number; in?: { x: number; y: number }; out?: { x: number; y: number } };
export type MotionPath = { points: MotionPathPoint[]; rotate?: boolean };
export type ElementAnimation = {
  id?: string;
  trigger: string;
  effect?: MotionEffect;
  frames?: MotionEffect[];
  duration?: number;
  delay?: number;
  easing?: string;
  durationToken?: string;
  easingToken?: string;
  iterations?: number | 'infinite';
  strength?: number;
  speed?: number;
  spring?: SpringSettings | null;
  stagger?: { interval?: number; reverse?: boolean } | null;
  split?: 'char' | 'word' | 'line' | '' | null;
  reducedFallback?: 'opacity' | 'none';
  /** タイムライン（Issue #208）：前の動き（id）の終わり（from 'end'）か始まり（'start'）から gap ms あとに始める。画面を開いたときの動きだけ */
  after?: { id: string; gap?: number; from?: 'end' | 'start' } | null;
  /** 道筋に沿って動く（Issue #161） */
  path?: MotionPath | null;
  scroll?: { source?: 'element' | 'page'; range?: [number, number] };
  /** 視差（Issue #185）：スクロールに対する速さ（%。-50〜50）。正は速く上へ、負はゆっくり（逆向き） */
  parallax?: number;
};

/** パネル（シート・モーダル）の動き（motion.ts） */
export type PanelMotion = { effect: string; duration: number; delay: number; distance: number; easing: number[]; first?: string };
export type ElementMotion = { open?: Partial<PanelMotion>; close?: Partial<PanelMotion>; feedback?: Partial<PanelMotion> };

export type IconShape = [string, Record<string, string | number>];
export type IconData = { name: string; node: IconShape[] };

export type StatusSetting = { text?: string; message?: string; retryLabel?: string; presentation?: string };
export type StatusMessages = { [state: string]: StatusSetting | undefined };

/** データ一覧・詳細の表示：どのデータの、どの項目を画像・タイトル・本文にするか。値がないときの表示（Issue #101） */
/** 動画の背景（Issue #248）：src は動画の URL、poster は読み込むまでと失敗したときの画像、overlay は文字を読みやすくする暗幕（%） */
export type BackgroundVideoSettings = { src: string; poster?: string; overlay?: number };
export type DataBinding = {
  datasetId?: string;
  image?: string;
  title?: string;
  fields?: string[];
  fallbacks?: { [fieldId: string]: { mode?: 'hide' | 'text' | string; text?: string } | undefined };
};
/**
 * データ一覧の見せ方（Issue #240）：カードか表。検索欄・並べ替え・1ページの件数・列の表示の形・表の見た目。
 * 色は直接の値か、色のトークン（headerToken・lineToken。トークンを優先する）
 */
export type DataListView = {
  layout?: 'cards' | 'table';
  caption?: string;
  search?: boolean;
  sortable?: string[];
  sort?: { fieldId: string; direction: 'asc' | 'desc' } | null;
  pageSize?: number;
  /** 1ページの件数だけを出し、ページ送りを出さない（#232） */
  limit?: boolean;
  formats?: { [fieldId: string]: ValueFormat | undefined };
  striped?: boolean;
  density?: 'compact' | 'normal' | 'relaxed';
  headerColor?: string;
  headerToken?: string;
  lineColor?: string;
  lineToken?: string;
};
/** 繰り返し（Issue #160）：データの行の数だけ、コンテナか共通部品の配置を並べる */
export type RepeatFilter = { fieldId: string; op: 'eq' | 'ne' | 'contains' | 'empty' | 'notEmpty' | 'gt' | 'lt'; value?: string | number | boolean };
export type RepeatSettings = {
  datasetId: string;
  filter?: RepeatFilter | null;
  sort?: { fieldId: string; direction: 'asc' | 'desc' } | null;
  limit?: number | null;
  offset?: number | null;
  emptyText?: string;
};
/** 表示の形（Issue #160） */
export type ValueFormat = { kind: 'date' | 'dateShort' | 'dateTime' | 'currency' | 'number' | 'truncate'; length?: number };
/** 値の流し込み（Issue #160・#53）。繰り返しの中では、その行の項目。外では datasetId と pick（first・latest・record・selected＝一覧で選んだ行）で1件を選ぶ */
export type ValueBinding = {
  text?: string;
  src?: string;
  alt?: string;
  href?: string;
  format?: ValueFormat | null;
  fallback?: { mode: 'hide' | 'text'; text?: string } | null;
  datasetId?: string;
  pick?: 'first' | 'latest' | 'record' | 'selected';
  recordId?: string;
  /** latest：この項目の新しい順で1件 */
  latestBy?: string;
  /** 共通部品の配置：部品の中の要素（partId）→ 割り当て */
  parts?: { [partId: string]: Pick<ValueBinding, 'text' | 'src' | 'alt' | 'href' | 'format' | 'fallback'> | undefined };
};
/** 読み込み中の表示（Issue #136） */
export type LoadingView = { mode?: 'skeleton' | 'spinner' | string; count?: number; color?: string; radius?: number; shimmer?: boolean };

export type PanelSettings = { kind?: 'sheet' | 'modal' | 'drawer' | string; title?: string; side?: string; [key: string]: unknown };

export type SiteAction =
  | { type: 'navigate' | 'openOverlay'; screenId: string }
  | { type: 'closeOverlay' }
  | { type: 'setState'; stateId: string; value: StateValue }
  | { type: 'toggleState'; stateId: string }
  | { type: 'incrementState'; stateId: string; amount: number }
  | { type: 'back' }
  | { type: 'link'; url: string; newTab?: boolean }
  | { type: 'phone' | 'email' | 'copy'; value: string }
  /** 通知を出す（#166）。componentId：自作の通知の部品（Issue #241）。tone：読み上げと見た目の種類。duration：消えるまでの ms（0 は閉じるまで出す） */
  | { type: 'toast'; value: string; componentId?: string; tone?: 'info' | 'success' | 'error'; duration?: number }
  /** 自作の通知の部品の中の「閉じる」（Issue #241） */
  | { type: 'dismissToast' }
  /** current：目次・セクションのドット（Issue #238）。対象が見えている間、aria-current="location" を付ける */
  | { type: 'scroll'; targetId: string; smooth?: boolean; current?: boolean }
  | { type: 'playMotion'; targetId: string }
  | { type: 'submit' | 'reset'; targetId?: string }
  | { type: 'call'; name: string; argument?: string };
export type Interaction = { id: string; trigger: 'click' | 'hover' | 'focus' | 'visible' | 'key'; key?: string; actions: SiteAction[] };

export type StateValue = boolean | string | number;
export type StateExpression =
  | { kind: 'value'; value: StateValue }
  | { kind: 'state'; id: string }
  | { kind: 'count'; datasetId: string }
  | { kind: 'sum'; datasetId: string; fieldId: string }
  | { kind: 'unary'; op: '!' | '+' | '-'; value: StateExpression }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '**' | '===' | '!==' | '<' | '<=' | '>' | '>=' | '&&' | '||'; left: StateExpression; right: StateExpression }
  | { kind: 'if'; condition: StateExpression; yes: StateExpression; no: StateExpression }
  | { kind: 'fn'; name: 'min' | 'max' | 'round' | 'abs' | 'length' | 'text'; args: StateExpression[] };
export type StateDefinition = { id: string; name: string; type: 'boolean' | 'text' | 'number' | 'choice'; initial: StateValue; options?: string[]; expression?: StateExpression };
export type StateBinding = {
  input?: { stateId: string };
  visible?: { stateId: string; operator: 'eq' | 'ne'; value: StateValue };
  style?: { stateId: string; operator: 'eq' | 'ne'; value: StateValue; values: Style };
  text?: { stateId: string; prefix?: string; suffix?: string };
  variant?: { stateId: string; values: Record<string, string> };
};
/** 文章の一部の装飾（Issue #150。rich-text.ts）。リンクは画面か URL */
export type RichSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Markdown のインラインのコード（Issue #177） */
  code?: boolean;
  color?: string;
  link?: { screenId?: string; url?: string; newTab?: boolean };
};
/** 段落（箇条書きでは1項目） */
export type RichBlock = { spans: RichSpan[] };

/** 画面の要素。type ごとに使うプロパティが違うので、すべて任意 */
export interface ElementData {
  id: string;
  type: string;
  name?: string;
  text?: string;
  /** 装飾つきの文章。text は装飾を除いた全文（Issue #150） */
  richText?: RichBlock[];
  /** 本文のスタイル（design.proseStyles の id。Issue #177） */
  prose?: string;
  src?: string;
  alt?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageFit?: string;
  imagePosition?: string;
  loading?: 'lazy' | 'eager' | string;
  decorative?: boolean;
  level?: number;
  style?: Style;
  tokenRefs?: TokenRefs;
  responsive?: ResponsiveValues;
  states?: ElementStates;
  stateTransition?: StateTransition;
  /** 直接書いた CSS（kebab-case の宣言） */
  css?: Record<string, string>;
  children?: ElementData[];
  combobox?: ComboboxSettings;
  comboboxPart?: ComboboxPart;
  targetScreenId?: string | null;
  interactions?: Interaction[];
  stateBinding?: StateBinding | null;
  action?: string | null;
  panel?: PanelSettings | null;
  panelHistory?: boolean;
  motion?: ElementMotion | null;
  animations?: ElementAnimation[];
  /** 画面の間でつなげる名前（Issue #176）。同じ名前の要素が、画面の切り替わりでつながって動く */
  viewTransition?: string;
  textContent?: 'split' | 'count' | string;
  countUp?: boolean;
  transition?: string;
  sharedImage?: boolean;
  icon?: IconData | null;
  iconSize?: number;
  iconPosition?: 'start' | 'end' | 'only' | string;
  value?: number | string;
  max?: number;
  loadingView?: LoadingView;
  locked?: boolean;
  binding?: DataBinding | null;
  backgroundVideo?: BackgroundVideoSettings | null;
  listView?: DataListView | null;
  repeat?: RepeatSettings | null;
  /** 部品の状態を、画面の状態につなぐ（Issue #201）：部品の状態の id → 画面の状態の id */
  stateLinks?: Record<string, string>;
  /** 取り込んだ部品（custom）の「値と変更」の項目を、画面の状態につなぐ（Issue #242）：項目 → 画面の状態の id */
  valueLinks?: Record<string, string>;
  /** 多言語（Issue #182）：言語のコード → 文言・画像の代わりの文言の訳 */
  i18n?: { [locale: string]: { text?: string; alt?: string } | undefined };
  /** 共通部品の定義の中で、配置ごとに数を変えられる項目（Issue #201） */
  itemList?: boolean;
  /** 配置ごとの項目の写しの id（描画時に付く） */
  itemId?: string;
  /** 描画時に付く：この要素が属する共通部品の定義の id（入れ子の状態のスコープに使う。Issue #207） */
  instanceComponentId?: string;
  /** 描画時に付く：入れ子の共通部品の配置が置かれている、外の配置の id */
  nestedIn?: string;
  /** 部品の中の「配置ごとの項目」（Issue #201）：項目のリストの要素の id → 項目ごとの上書き */
  itemLists?: Record<string, Array<{ id: string; overrides?: Record<string, ElementPatch | undefined> }>>;
  dataBind?: ValueBinding | null;
  dataset?: string;
  statusMessages?: StatusMessages;
  /** 共通部品の配置 */
  componentId?: string;
  variantId?: string;
  childOverrides?: { [partId: string]: Partial<ElementData> | undefined };
  /** 共通部品を展開したときの、配置と定義の要素 */
  instanceId?: string;
  partId?: string;
  /** 登録した React 部品 */
  customComponentId?: string;
  customValues?: { [field: string]: unknown };
  control?: ControlSettings;
  codeName?: string;
  /** コードで足したクラス（Tailwind など。空白区切り）。画面のファイル（src/screens/）と往復する（Issue #89） */
  classes?: string;
  /** コードで足した属性（aria-*・data-*・id・title・role・lang） */
  attributes?: Record<string, string>;
  /** コードで要素の前に書いたコメント */
  codeComment?: string;
}

/** 部品の差分（バリアント・配置の上書き）。null は「基本の値に戻す」 */
export type ElementPatch = { [key: string]: unknown };

export type TokenSlot = { value?: unknown; ref?: string };
export interface DesignToken {
  id: string;
  name: string;
  kind: string;
  value?: unknown;
  ref?: string;
  modes?: { [modeId: string]: TokenSlot | undefined };
  codeName?: string;
  description?: string;
}

export interface ComponentVariant {
  id: string;
  name: string;
  axisValues?: Record<string, string>;
  values?: { [nodeId: string]: ElementPatch | undefined };
}

/** 切り替えの自動の動き（Issue #176）。preset 'none' は動かさない。duration・easing は細かい上書き */
export type SmartAnimate = { preset: 'none' | 'su' | 'puni' | 'poyon'; duration?: number; easing?: string };

export interface DesignComponent {
  id: string;
  name: string;
  variables?: StateDefinition[];
  type: string;
  root?: ElementData;
  variants?: ComponentVariant[];
  axes?: Array<{ id: string; name: string; values: string[] }>;
  smartAnimate?: SmartAnimate;
  codeName?: string;
  /** 古い形式（root が無いとき） */
  content?: Partial<ElementData>;
  style?: Style;
  tokenRefs?: TokenRefs;
}

export interface DesignSystemData {
  tokens: DesignToken[];
  components: DesignComponent[];
  modes?: Array<{ id: string; name: string }>;
}

export type Breakpoint = { id: string; name: string; minWidth: number };

export type BackgroundSetting = { color?: string; tokenId?: string };

export type FieldType = 'text' | 'richText' | 'number' | 'boolean' | 'select' | 'datetime' | 'image' | 'tags';
export type DataValue = string | number | boolean | readonly string[] | null | undefined;
export interface DataField {
  id: string;
  label: string;
  type: FieldType | string;
  options?: readonly string[];
  required?: boolean;
  allow?: { null?: boolean; absent?: boolean; empty?: boolean };
  maxLength?: number;
  min?: number;
  max?: number;
  minDate?: string;
  maxDate?: string;
  visible?: boolean;
  codeName?: string;
  /** リッチテキスト（Markdown）の、サイトの外へのリンクを新しいタブで開く（Issue #164） */
  newTab?: boolean;
}
export interface DataRecord { id: string; values: { [fieldId: string]: DataValue } }
export interface DatasetData { id: string; name: string; fields: DataField[]; records: DataRecord[]; codeName?: string; status?: string; /** 'products'：注文の商品（Issue #155） */ role?: string }

/** データのプレビュー条件（空・項目の欠け・長文・画像なし・多件数） */
export type DataScenario = { kind: string; fieldId?: string; count?: number };

export interface ProductData { id: string; name: string; price: number; image?: string | null; values?: { [fieldId: string]: DataValue } }

export type OverlaySettings = {
  kind: 'modal' | 'sheet' | 'popover' | 'toast';
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'anchor';
  width?: number;
  backdrop?: boolean;
  outsideClose?: boolean;
  escapeClose?: boolean;
  scrollLock?: boolean;
  motion?: 'fade' | 'slide' | 'scale' | 'poyon' | 'none';
  history?: boolean;
  /** トーストの表示時間（ms）。0 なら自動では閉じない */
  duration?: number;
};

export interface ScreenData {
  id: string;
  name: string;
  variables?: StateDefinition[];
  codeName?: string;
  description?: string;
  elements: ElementData[];
  overlay?: OverlaySettings;
  background?: BackgroundSetting;
  /** 画面の端まで広げる（内容の最大幅を使わない） */
  fullBleed?: boolean;
  /** 画面直下の要素を複数選択して変えた、親の揃えと間隔 */
  layout?: Style;
  /** 検討用の画面（Issue #173）：下書きはサイトに入れない。variantOf は案の元の画面、group は画面のまとまり */
  status?: 'draft' | null;
  variantOf?: string | null;
  group?: string | null;
  /** SEO と共有のカード（Issue #158）：タイトルの上書き・OGP画像・検索に載せない・canonical の上書き。説明は description */
  seo?: { title?: string; ogImage?: string; /** 画面の見た目から作った OGP 画像の素材（Issue #243） */ ogAsset?: string; noindex?: boolean; canonical?: string } | null;
  /** 多言語（Issue #182）：言語のコード → 画面名・タイトル・説明の訳 */
  i18n?: { [locale: string]: { name?: string; title?: string; description?: string } | undefined };
  /** スクロールのスナップ（Issue #185）：近いときに吸い付く・区切りごとに必ず止める。offset は固定ヘッダーの高さ（px） */
  snap?: { type?: 'proximity' | 'mandatory'; offset?: number } | null;
  /**
   * 詳細画面を、データの行ごとのページとして事前に描く（Issue #245）。slugField：URL に使う項目（無ければ行の ID）、
   * titleField・descriptionField・imageField：ページのタイトル・説明・OGP 画像の項目。limit：作るページの上限（既定 100、最大 1000）
   */
  prerender?: { enabled?: boolean; slugField?: string; titleField?: string; descriptionField?: string; imageField?: string; limit?: number } | null;
  /** 注文の処理中・失敗の文言（パネルの画面で使う） */
  orderStatusMessages?: StatusMessages;
  /** 画面のファイルに、往復できない書き方（map・条件・フックなど）がある。ファイルを正とし、ツールは書き換えない（Issue #89） */
  codeManaged?: boolean;
}

export interface AssetData { id: string; name?: string; mime: string; file?: string; data?: string; width?: number; height?: number; bytes?: number }
export interface SiteIconsData {
  sourceId: string;
  fit: 'contain' | 'cover';
  transparent: boolean;
  backgroundColor: string;
  themeColor: string;
  shortName: string;
  images: { size: number; assetId: string }[];
}

export interface ProjectData {
  name?: string;
  librarySources?: { disabled: string[]; custom: { id: string; name: string; source: string; indexUrl: string; itemUrl: string; license: string; licenseUrl: string; checkedAt: string; dependencies: string }[] };
  exportOptions?: { shadcn?: boolean; storybook?: boolean } | null;
  /** LP の運用（Issue #175）：GA4 の測定ID・フォームの送信先・プライバシーポリシーのURL・同意の文 */
  services?: { ga4?: string; formEndpoint?: string; privacyUrl?: string; consentText?: string; analytics?: { provider: 'umami'; scriptUrl: string; websiteId: string } | { provider: 'goatcounter'; endpoint: string } | null } | null;
  /** サイト全体の SEO（Issue #158）：公開するURL・既定のOGP画像・アイコン・作成者・運営者・言語 */
  seo?: { url?: string; domain?: string; ogImage?: string; icon?: string; author?: string; organization?: string; lang?: string; notFoundScreenId?: string } | null;
  /** 配信先（Issue #250）：Cloudflare Pages のプロジェクト名（<name>.pages.dev） */
  hosting?: { cloudflare?: { project?: string } | null } | null;
  /** 多言語（Issue #182）：基準言語と、足した言語 */
  locales?: { base: string; baseName?: string; others: Array<{ code: string; name: string }> } | null;
  startScreenId: string | null;
  screens: ScreenData[];
  designSystem?: DesignSystemData;
  datasets?: DatasetData[];
  assets?: AssetData[];
  siteIcons?: SiteIconsData;
  products?: ProductData[];
  productFields?: DataField[];
  breakpoints?: Breakpoint[];
}
