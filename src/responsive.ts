// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { CSSProperties } from 'react';
import { cssToStyle } from './css-declarations.ts';
import type { Breakpoint, ElementData, GradientValue, ResponsiveValues, Style, StyleValue } from './model-types.ts';

export function orderedBreakpoints(breakpoints: readonly Breakpoint[] = []) {
  return [...breakpoints].sort((left, right) => left.minWidth - right.minWidth);
}

export function responsiveValues(overrides: ResponsiveValues = {}, breakpoints: readonly Breakpoint[] | undefined, width: number) {
  const values: Style = {};
  const sources: Record<string, string> = {};
  for (const { id, minWidth } of orderedBreakpoints(breakpoints)) {
    if (width < minWidth) break;
    for (const [property, value] of Object.entries(overrides[id] ?? {})) {
      if (value == null) continue;
      values[property] = value;
      sources[property] = id;
    }
  }
  return { values, sources };
}

/** 通常・トークン・幅別の値へ、条件成立時の差分を重ねる。保存データは変えない。直接 CSS は elementStyle で最後に適用する。 */
export function applyConditionalStyle(element: ElementData, values: Style, breakpoints: readonly Breakpoint[] | undefined, width: number): ElementData {
  const responsive = responsiveValues(element.responsive, breakpoints, width).values;
  return { ...element, style: { ...element.style, ...responsive, ...values }, responsive: undefined,
    tokenRefs: Object.fromEntries(Object.entries(element.tokenRefs ?? {}).filter(([key]) => !Object.hasOwn(values, key) && !Object.hasOwn(responsive, key))) };
}

/** グラデーションの値（{ type, angle, stops }）を CSS の background-image にする（Issue #95） */
export function gradientValue(input: unknown) {
  const gradient = input as Partial<GradientValue> | null | undefined;
  if (!gradient || !Array.isArray(gradient.stops) || gradient.stops.length < 2) return undefined;
  const stops = gradient.stops.map(({ color, position }) => `${color} ${isNumber(position) ? position : 0}%`).join(', ');
  const angle = isNumber(gradient.angle) ? gradient.angle : 180;
  if (gradient.type === 'radial') return `radial-gradient(circle, ${stops})`;
  if (gradient.type === 'conic') return `conic-gradient(from ${angle}deg, ${stops})`;
  return `linear-gradient(${angle}deg, ${stops})`;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * 重ねた塗り（Issue #152）：[{ type: 'color' | 'gradient' | 'image', color, gradient, url, size, position, repeat, opacity, hidden }]。
 * 上から順に重ねる。色と不透明度は color-mix で混ぜる。画像の不透明度は扱わない（CSS の背景に不透明度が無いため）
 */
export function fillLayers(input: unknown) {
  if (!Array.isArray(input)) return [];
  const result: Array<{ image: string; size?: StyleValue; position?: StyleValue; repeat?: StyleValue }> = [];
  for (const raw of input as Array<Record<string, unknown>>) {
    if (!raw || typeof raw !== 'object' || raw.hidden) continue;
    const opacity = isNumber(raw.opacity) && raw.opacity < 100 ? Math.max(0, raw.opacity) : null;
    const tint = (color: string) => opacity === null ? color : `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
    if (raw.type === 'color' && typeof raw.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(raw.color)) {
      result.push({ image: `linear-gradient(${tint(raw.color)}, ${tint(raw.color)})` });
    } else if (raw.type === 'gradient') {
      const gradient = raw.gradient as GradientValue | undefined;
      const value = gradientValue(gradient && { ...gradient, stops: gradient.stops?.map((stop) => ({ ...stop, color: tint(stop.color) })) });
      if (value) result.push({ image: value });
    } else if (raw.type === 'image' && typeof raw.url === 'string' && /^(https?:\/\/|\/|data:image\/)[^"\\\n()<>]*$/.test(raw.url)) {
      result.push({ image: `url(${JSON.stringify(raw.url)})`, size: raw.size as StyleValue ?? 'cover', position: raw.position as StyleValue ?? 'center', repeat: raw.repeat as StyleValue ?? 'no-repeat' });
    }
  }
  return result;
}

/** 影の値（{ x, y, blur, color }）を CSS の text-shadow にする（Issue #150） */
export function textShadowValue(input: unknown) {
  const shadow = input as { x?: unknown; y?: unknown; blur?: unknown; color?: unknown } | null | undefined;
  if (!shadow || typeof shadow !== 'object' || typeof shadow.color !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(shadow.color)) return undefined;
  const length = (value: unknown) => `${isNumber(value) ? value : 0}px`;
  return `${length(shadow.x)} ${length(shadow.y)} ${length(shadow.blur)} ${shadow.color}`;
}

/**
 * 文字の設定（Issue #150）。縦の位置・影・文字へのグラデーション・折り返し・約物の詰め・段落の間隔・箇条書き。
 * 文字へのグラデーションは、-webkit-background-clip: text と -webkit-text-fill-color で塗る。
 * 対応しない環境では、文字色（無ければ最初の色）のまま読める
 */
export function textStyles({ textVerticalAlign, textShadow, textGradient, textWrap, palt, paragraphSpacing, listStyle }: Style, color?: StyleValue) {
  const style: Record<string, StyleValue> = {};
  if (textVerticalAlign === 'center' || textVerticalAlign === 'end' || textVerticalAlign === 'start') style.alignContent = textVerticalAlign;
  const shadow = textShadowValue(textShadow);
  if (shadow) style.textShadow = shadow;
  const gradient = gradientValue(textGradient);
  if (gradient) {
    const first = (textGradient as GradientValue).stops[0]?.color;
    Object.assign(style, { color: color ?? first, backgroundImage: gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' });
  }
  if (textWrap === 'nowrap') style.whiteSpace = 'nowrap';
  else if (textWrap === 'balance' || textWrap === 'pretty' || textWrap === 'wrap') style.textWrap = textWrap;
  if (palt === true) style.fontFeatureSettings = '"palt" 1';
  if (isNumber(paragraphSpacing)) style['--paragraph-spacing'] = `${paragraphSpacing}px`;
  if (listStyle === 'disc' || listStyle === 'decimal') style['--list-style'] = listStyle;
  return style;
}

/**
 * X・Y・Z の軸の回転（度。CSS の rotateX(x) rotateY(y) rotateZ(z) の順）を、1つの軸のまわりの回転にする（Issue #233）。
 * 返り値は CSS の rotate の値（「15deg」か「x y z 30deg」）。回していなければ undefined
 */
export function rotation3d(x: number, y: number, z: number): string | undefined {
  if (!x && !y) return z ? `${z}deg` : undefined;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const [a, b, c] = [radians(x), radians(y), radians(z)];
  const rx = [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const ry = [[Math.cos(b), 0, Math.sin(b)], [0, 1, 0], [-Math.sin(b), 0, Math.cos(b)]];
  const rz = [[Math.cos(c), -Math.sin(c), 0], [Math.sin(c), Math.cos(c), 0], [0, 0, 1]];
  const multiply = (p: number[][], q: number[][]) => p.map((row) => q[0].map((_, column) => row.reduce((sum, value, index) => sum + value * q[index][column], 0)));
  const m = multiply(multiply(rx, ry), rz);
  const cosine = Math.min(1, Math.max(-1, (m[0][0] + m[1][1] + m[2][2] - 1) / 2));
  const angle = Math.acos(cosine);
  if (angle < 1e-9) return undefined;
  let axis: number[];
  if (Math.PI - angle < 1e-6) {
    // 180 度の近くは、対角の成分から軸を出す（符号は最も大きい成分に合わせる）
    const diagonal = [m[0][0], m[1][1], m[2][2]].map((value) => Math.sqrt(Math.max(0, (value + 1) / 2)));
    const largest = diagonal.indexOf(Math.max(...diagonal));
    axis = diagonal.map((value, index) => index === largest ? value : Math.sign(m[largest][index] + m[index][largest] || 1) * value);
  } else {
    const sine = 2 * Math.sin(angle);
    axis = [(m[2][1] - m[1][2]) / sine, (m[0][2] - m[2][0]) / sine, (m[1][0] - m[0][1]) / sine];
  }
  const round = (value: number) => Math.round(value * 10000) / 10000 || 0;
  return `${axis.map(round).join(' ')} ${round(angle * 180 / Math.PI)}deg`;
}

export function elementStyle(element: Pick<ElementData, 'style' | 'responsive' | 'states' | 'stateTransition' | 'css'>, breakpoints: readonly Breakpoint[] | undefined, width: number, parent?: Pick<ElementData, 'type' | 'style' | 'responsive' | 'css'>): CSSProperties {
  const { values } = responsiveValues(element.responsive, breakpoints, width);
  const merged: Style = { ...element.style, ...values };
  const { lineClamp, blur, backdropBlur, rotate, rotateX, rotateY, translateZ, scale, translateX, translateY, widthMode, heightMode, constraintX, constraintY, flipX, flipY, safeArea, scrollHide, backgroundGradient, backgroundImageUrl,
    textVerticalAlign, textShadow, textGradient, textWrap, palt, paragraphSpacing, listStyle,
    brightness, contrast, saturate, grayscale, hueRotate, skewX, skewY, fills, ...rest } = merged;
  const style: Record<string, StyleValue> = rest;
  // 背景の塗り：グラデーションを上、背景画像を下に重ねる
  const layers = [gradientValue(backgroundGradient), typeof backgroundImageUrl === 'string' && backgroundImageUrl
    ? `url(${JSON.stringify(backgroundImageUrl)})` : undefined].filter(Boolean);
  // 重ねた塗り（Issue #152）は、グラデーションと背景画像の上に重ねる
  const extra = fillLayers(fills);
  if (extra.length && !style.backgroundImage) {
    const base = layers.length ? [{ image: layers.join(', '), size: style.backgroundSize, position: style.backgroundPosition, repeat: style.backgroundRepeat, count: layers.length }] : [];
    const all = [...extra.map((layer) => ({ ...layer, count: 1 })), ...base];
    const list = (key: 'size' | 'position' | 'repeat', fallback: string) => all.flatMap((layer) => Array(layer.count).fill(String(layer[key] ?? fallback))).join(', ');
    style.backgroundImage = all.map(({ image }) => image).join(', ');
    style.backgroundSize = list('size', 'auto');
    style.backgroundPosition = list('position', '0% 0%');
    style.backgroundRepeat = list('repeat', 'repeat');
  } else if (layers.length && !style.backgroundImage) style.backgroundImage = layers.join(', ');
  Object.assign(style, textStyles({ textVerticalAlign, textShadow, textGradient, textWrap, palt, paragraphSpacing, listStyle }, style.color));
  // セーフエリア：ノッチやホームバーに重ならないよう、余白を端末の安全な領域以上にする（Issue #92）
  if (safeArea) {
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const base = style[`padding${side}`] ?? style.padding ?? 0;
      style[`padding${side}`] = `max(${typeof base === 'number' ? `${base}px` : base}, env(safe-area-inset-${side.toLowerCase()}))`;
    }
  }
  // Fill は親の主軸なら余った場所、交差軸ならストレッチ。画面の直下は縦並び。
  const parentStyle = { ...parent?.style, ...responsiveValues(parent?.responsive, breakpoints, width).values, ...cssToStyle(parent?.css ?? {}) };
  const display = parentStyle.display ?? (!parent || parent.type === 'container' ? 'flex' : 'block');
  const mainAxis = String(parentStyle.flexDirection ?? (parent ? 'row' : 'column')).startsWith('row') ? 'width' : 'height';
  for (const [axis, mode] of [['width', widthMode], ['height', heightMode]] as const) {
    if (mode === 'fill') {
      if (style.position === 'absolute' || style.position === 'fixed') style[axis] = '100%';
      else if (display === 'flex' && axis === mainAxis) {
        delete style[axis];
        style.flexGrow ??= 1; style.flexBasis = 0;
        style[axis === 'width' ? 'minWidth' : 'minHeight'] ??= 0;
      } else if (display === 'flex' || display === 'grid') {
        style[axis] = 'auto';
        style[display === 'grid' && axis === 'width' ? 'justifySelf' : 'alignSelf'] = 'stretch';
      } else style[axis] = '100%';
    } else if (axis === 'height' && (mode === 'screen' || mode === 'screen-dynamic')) {
      // 画面の高さに合わせる（Issue #185）：中身が多ければ伸びる（最小の高さ）。固定ヘッダーの高さ（スナップの offset）を引く
      delete style.height;
      style.minHeight = `calc(${mode === 'screen' ? '100svh' : '100dvh'} - var(--rm-snap-offset, 0px))`;
    } else if (mode === 'hug') {
      style[axis] = 'fit-content';
      if (display === 'flex') style.flexShrink ??= 0;
    } else if (style[axis] != null && display === 'flex') style.flexShrink ??= 0;
  }
  // 効果と変形（Issue #96）。変形は個別のプロパティ（rotate・scale・translate）にし、モーションの transform と重ねられるようにする
  // フィルター（Issue #152）：明るさ・コントラスト・彩度は 100 が元のまま、グレースケールは 0〜100、色相は度
  const filters = [
    isNumber(blur) && blur > 0 ? `blur(${blur}px)` : '',
    isNumber(brightness) && brightness !== 100 ? `brightness(${brightness}%)` : '',
    isNumber(contrast) && contrast !== 100 ? `contrast(${contrast}%)` : '',
    isNumber(saturate) && saturate !== 100 ? `saturate(${saturate}%)` : '',
    isNumber(grayscale) && grayscale > 0 ? `grayscale(${grayscale}%)` : '',
    isNumber(hueRotate) && hueRotate !== 0 ? `hue-rotate(${hueRotate}deg)` : '',
  ].filter(Boolean);
  if (filters.length) style.filter = filters.join(' ');
  // 傾斜（Issue #152）。個別の変形プロパティが無いので transform で書く（動きの transform とは別に、動いていないときに効く）
  if ((isNumber(skewX) && skewX !== 0) || (isNumber(skewY) && skewY !== 0)) style.transform = `skew(${isNumber(skewX) ? skewX : 0}deg, ${isNumber(skewY) ? skewY : 0}deg)`;
  if (isNumber(backdropBlur) && backdropBlur > 0) {
    style.backdropFilter = `blur(${backdropBlur}px)`;
    style.WebkitBackdropFilter = style.backdropFilter;
  }
  // 3D の回転（Issue #233）：X・Y・Z の回転を、1つの軸のまわりの回転（rotate: x y z 角度）にまとめる。
  // 個別の変形プロパティのままにして、動き（transform）と重ねられるようにする
  const turned = rotation3d(isNumber(rotateX) ? rotateX : 0, isNumber(rotateY) ? rotateY : 0, isNumber(rotate) ? rotate : 0);
  if (turned) style.rotate = turned;
  if (flipX || flipY) style.scale = `${(isNumber(scale) ? scale / 100 : 1) * (flipX ? -1 : 1)} ${(isNumber(scale) ? scale / 100 : 1) * (flipY ? -1 : 1)}`;
  else if (isNumber(scale) && scale !== 100) style.scale = scale / 100;
  const translations = [translateX, translateY].map((value) => isNumber(value) ? `${value}px` : typeof value === 'string' ? value : '0px');
  if (style.position === 'absolute' || style.position === 'fixed') {
    for (const [index, mode] of [constraintX, constraintY].entries()) {
      const [start, end, axis] = index === 0 ? ['left', 'right', 'width'] : ['top', 'bottom', 'height'];
      if (mode === 'center') {
        style[start] = '50%'; style[end] = 'auto';
        translations[index] = translations[index] === '0px' ? '-50%' : `calc(-50% + ${translations[index]})`;
      } else if (mode === 'start') { style[start] ??= 0; style[end] = 'auto'; }
      else if (mode === 'end') { style[end] ??= 0; style[start] = 'auto'; }
      else if (mode === 'stretch') { style[start] ??= 0; style[end] ??= 0; style[axis] = 'auto'; }
    }
  }
  // 奥行き（Issue #233）：translate の3つ目の値（手前が＋）
  if (isNumber(translateZ) && translateZ !== 0) style.translate = `${translations.join(' ')} ${translateZ}px`;
  else if (translations.some((value) => value !== '0px')) style.translate = translations.join(' ');
  // 行数の上限：省略記号で切る（Issue #93）。プレビューと書き出しで同じ宣言にする
  if (isNumber(lineClamp) && Number.isInteger(lineClamp) && lineClamp > 0) {
    Object.assign(style, { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lineClamp, overflow: 'hidden' });
  }
  // 状態ごとのスタイルを持つ要素は、状態の変化をなめらかにする（Issue #97）
  if (element.states && Object.values(element.states).some((state) => Object.keys(state?.style ?? {}).length)) {
    const duration = element.stateTransition?.duration;
    Object.assign(style, {
      transitionProperty: 'color, background-color, border-color, box-shadow, opacity, filter, translate, scale, rotate',
      transitionDuration: `${isNumber(duration) ? duration : 150}ms`,
      transitionTimingFunction: element.stateTransition?.easing || 'ease-out',
    });
  }
  // 直接書いた CSS（Issue #52）は、GUI の設定・幅別の値より優先する（最後に重ねる）
  if (element.css && typeof element.css === 'object') {
    const direct = cssToStyle(element.css);
    for (const axis of ['gridColumn', 'gridRow']) if (axis in direct) { delete style[`${axis}Start`]; delete style[`${axis}End`]; }
    Object.assign(style, direct);
  }
  // Reactで配置の変更を繰り返しても、短縮形と個別指定が競合しないよう描画時は個別指定にそろえる。
  for (const axis of ['gridColumn', 'gridRow']) {
    if (style[axis] == null) continue;
    const [start, end = 'auto'] = String(style[axis]).split('/').map((value) => value.trim());
    style[`${axis}Start`] ??= start;
    style[`${axis}End`] ??= end;
    delete style[axis];
  }
  for (const property of Object.keys(style)) if (style[property] == null) delete style[property];
  // 幅ごとに表示・非表示を切り替える（Issue #99）。hidden: false は、狭い幅の非表示を広い幅で戻す
  const { hidden } = style;
  delete style.hidden;
  const result = style as CSSProperties;
  if (hidden) return { ...result, display: 'none' };
  return style.display === 'grid' ? { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', ...result } : result;
}

export function mergeResponsive(base: ResponsiveValues | undefined, patch: ResponsiveValues | null | undefined) {
  const result: ResponsiveValues = { ...base };
  for (const [id, values] of Object.entries(patch ?? {})) {
    result[id] = { ...result[id], ...values };
  }
  return result;
}

export function changeResponsive(patch: ResponsiveValues | undefined, before: ResponsiveValues | undefined, after: ResponsiveValues | undefined) {
  const result: ResponsiveValues = { ...patch };
  for (const id of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    for (const property of new Set([...Object.keys(before?.[id] ?? {}), ...Object.keys(after?.[id] ?? {})])) {
      if (before?.[id]?.[property] !== after?.[id]?.[property]) {
        result[id] = { ...result[id], [property]: after?.[id]?.[property] ?? null };
      }
    }
  }
  return result;
}
