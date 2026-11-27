// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * スタイルの値を、スタイルシートにそのまま書ける宣言にする。書き出し（export-styles.js）と、
 * 状態ごとのスタイル（state-styles.ts。プレビューの <style>）で共有する
 */
const lengthProperties = new Set([
  'fontSize', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'gap', 'rowGap', 'columnGap', 'top', 'right', 'bottom', 'left',
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight', 'borderRadius', 'letterSpacing', 'textDecorationThickness', 'textUnderlineOffset', 'outlineWidth', 'outlineOffset',
  'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius', 'flexBasis',
]);
const unitlessProperties = new Set(['fontWeight', 'lineHeight', 'opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'WebkitLineClamp', 'scale', 'gridColumnStart', 'gridColumnEnd', 'gridRowStart', 'gridRowEnd']);
const otherProperties = new Set([
  'color', 'backgroundColor', 'boxShadow', 'position', 'display', 'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow',
  'alignItems', 'alignSelf', 'justifyContent', 'flexDirection', 'flexWrap',
  'border', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight', 'textAlign', 'whiteSpace', 'overflowWrap',
  'borderStyle', 'borderColor', 'textDecorationLine', 'overflow', 'WebkitBoxOrient',
  'filter', 'backdropFilter', 'WebkitBackdropFilter', 'mixBlendMode', 'rotate', 'translate',
  'transitionProperty', 'transitionDuration', 'transitionTimingFunction',
  'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'fontFamily', 'aspectRatio', 'fontFeatureSettings',
]);
const cssFunctions = new Set([
  'calc', 'min', 'max', 'clamp', 'var', 'env', 'repeat', 'minmax', 'fit-content', 'rgb', 'rgba', 'hsl', 'hsla', 'blur', 'brightness', 'contrast', 'saturate', 'grayscale', 'hue-rotate', 'skew', 'color-mix', 'cubic-bezier', 'oklch', 'linear-gradient', 'radial-gradient', 'conic-gradient',
]);
export const cssProperty = (property: string) => (property.startsWith('--') ? property : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));

function safeValue(value: string) {
  if (!/^[a-z0-9#.%(), +*/_-]+$/i.test(value) || value.includes('/*')) return false;
  let depth = 0;
  for (const match of value.matchAll(/([\w-]+)\(|[()]/g)) {
    if (match[0] === ')') {
      if (--depth < 0) return false;
    } else {
      if (match[1] && !cssFunctions.has(match[1].toLowerCase())) return false;
      depth += 1;
    }
  }
  return depth === 0;
}

/** font-family：引用符で囲んだ書体名（英数字と空白）と、総称ファミリー・var() の並び（Issue #94） */
function safeFamily(value: unknown) {
  return typeof value === 'string' && value.split(',').every((part) => /^("[A-Za-z0-9][A-Za-z0-9 ]*"|[a-z][a-z-]*|var\(--[a-z0-9-]+\))$/.test(part.trim()));
}

/** font-feature-settings：引用符で囲んだ4文字のタグと、0・1（"palt" 1 など。Issue #150） */
function safeFeatures(value: string) {
  return value.split(',').every((part) => /^"[a-z0-9]{4}"( [01]| on| off)?$/.test(part.trim()));
}

/** background-image：グラデーションと url("...")（引用符・改行・括弧を含まないURL）の重ね */
function safeImage(value: string) {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')') depth -= 1;
    else if (value[index] === ',' && depth === 0) { layers.push(value.slice(start, index)); start = index + 1; }
  }
  layers.push(value.slice(start));
  return layers.every((layer) => /^url\("[^"\\\n()<>]*"\)$/.test(layer.trim()) || safeValue(layer.trim()));
}

export function declarations(style: Record<string, unknown>) {
  const result = new Map<string, string>();
  for (const [property, value] of Object.entries(style)) {
    if (value == null || value === '') continue;
    const length = lengthProperties.has(property);
    // 直接書いた CSS（#52）：知らないプロパティでも、名前と値が安全な文字列なら書き出す
    const direct = typeof value === 'string' && /^(--[a-z0-9-]+|[A-Z]?[a-z][A-Za-z]*)$/.test(property) && safeValue(value);
    if (!length && !unitlessProperties.has(property) && !otherProperties.has(property) && !direct) return null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || (!length && !unitlessProperties.has(property))) return null;
      result.set(cssProperty(property), length && value !== 0 ? `${value}px` : String(value));
    } else {
      // React can ignore a malformed inline declaration. Keep the element on that path when a value
      // cannot be written verbatim to a stylesheet without changing how CSS parses it.
      if (typeof value !== 'string') return null;
      const safe = property === 'backgroundImage' ? safeImage(value) : property === 'fontFamily' ? safeFamily(value)
        : property === 'fontFeatureSettings' ? safeFeatures(value) : safeValue(value);
      if (!safe) return null;
      result.set(cssProperty(property), value.trim());
    }
  }
  return result;
}


/**
 * 要素に直接書く CSS（Issue #52）。「プロパティ: 値;」の並びだけを受け付け、セレクター・@ルール・外部読み込み・
 * url()・expression などは受け付けない。返り値は { declarations: { 'kebab-name': value }, errors: [文] }
 */
export function parseElementCss(text: unknown) {
  const declarations: Record<string, string> = {};
  const errors: string[] = [];
  const source = String(text ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/[{}@<>\\]/.test(source)) errors.push('セレクター・波かっこ・@ルール（@import など）は書けません。宣言（プロパティ: 値;）だけを書いてください。');
  for (const [index, raw] of source.split(';').entries()) {
    const line = raw.trim();
    if (!line || /[{}@<>\\]/.test(line)) continue;
    const colon = line.indexOf(':');
    if (colon < 0) { errors.push(`${index + 1}つ目の宣言「${line}」に「:」がありません。`); continue; }
    const property = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim().replace(/\s*!important$/i, '');
    if (!/^(--[a-z0-9-]+|-?[a-z][a-z-]*)$/.test(property)) { errors.push(`プロパティ名「${property}」を確かめてください。`); continue; }
    if (!value || !safeValue(value)) { errors.push(`「${property}」の値「${value}」は書けません（使える関数：${[...cssFunctions].join('・')}）。`); continue; }
    declarations[property] = value;
  }
  return { declarations, errors };
}

/** kebab-case の宣言を、React の style のキーにする（カスタムプロパティはそのまま） */
export function cssToStyle(declarations: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(Object.entries(declarations).map(([property, value]) => [
    property.startsWith('--') ? property : property.replace(/^-(webkit|moz|ms)-/, (_, vendor: string) => `${vendor[0].toUpperCase()}${vendor.slice(1)}-`)
      .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), value,
  ]));
}
