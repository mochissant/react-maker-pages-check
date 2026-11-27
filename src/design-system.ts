// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import { changeResponsive, mergeResponsive } from './responsive.ts';
import { remapInteractions } from './interactions.ts';
import { variablesForElements } from './state-logic.ts';
import type { BackgroundSetting, DesignComponent, DesignSystemData, DesignToken, ElementData, ElementPatch, StateDefinition, Style, StyleValue, TokenSlot, TokenRefs } from './model-types.ts';

type Shadow = { x: number; y: number; blur: number; spread: number; color: string; alpha: number; inset?: boolean };
type TokenLiteral = string | number | Record<string, string | number>;

export const tokenKinds: Record<string, { label: string; example: string }> = {
  color: { label: '色', example: '#3546ba' },
  fontSize: { label: '文字サイズ', example: '16px' },
  spacing: { label: '余白', example: '12' },
  shadow: { label: 'シャドウ', example: '0px 4px 12px 0px #00000040' },
  radius: { label: '角丸', example: '8' },
  borderWidth: { label: '線の太さ', example: '1' },
  fontWeight: { label: '文字の太さ', example: '700' },
  lineHeight: { label: '行間', example: '1.5' },
  letterSpacing: { label: '字間', example: '0.5' },
  fontFamily: { label: '書体', example: '"Noto Sans JP", sans-serif' },
  duration: { label: '動きの時間', example: '200' },
  easing: { label: '動きの曲線', example: 'cubic-bezier(0.2, 0, 0, 1)' },
  opacity: { label: '不透明度', example: '0.6' },
  zIndex: { label: '重なり順', example: '10' },
  textStyle: { label: '文字スタイル', example: '{"fontSize":"1.5rem","lineHeight":1.3,"fontWeight":700}' },
};

/** 文字スタイル（複合トークン。Issue #114）の中身。Tailwind の --text-* と同じ組み合わせ＋書体 */
export const textStyleParts: Array<[string, string]> = [['fontSize', '文字サイズ'], ['lineHeight', '行間'], ['letterSpacing', '字間'], ['fontWeight', '太さ'], ['fontFamily', '書体']];

export const borderSides: Array<[string, string]> = [['Top', '上'], ['Right', '右'], ['Bottom', '下'], ['Left', '左']];
export const radiusCorners: Array<[string, string]> = [['TopLeft', '左上'], ['TopRight', '右上'], ['BottomRight', '右下'], ['BottomLeft', '左下']];

export const propertyKinds: Record<string, string | undefined> = {
  color: 'color', backgroundColor: 'color', fontSize: 'fontSize', padding: 'spacing', gap: 'spacing',
  boxShadow: 'shadow', borderColor: 'color', borderWidth: 'borderWidth', borderRadius: 'radius',
  fontWeight: 'fontWeight', lineHeight: 'lineHeight', letterSpacing: 'letterSpacing', fontFamily: 'fontFamily',
  opacity: 'opacity', zIndex: 'zIndex', textStyle: 'textStyle',
  ...Object.fromEntries(borderSides.map(([side]) => [`border${side}Width`, 'borderWidth'])),
  ...Object.fromEntries(borderSides.flatMap(([side]) => [[`padding${side}`, 'spacing'], [`margin${side}`, 'spacing']])),
  ...Object.fromEntries(radiusCorners.map(([corner]) => [`border${corner}Radius`, 'radius'])),
};

/** 単位を付けずに書き出す種類（それ以外の数値は px） */
export const unitlessTokenKinds = new Set(['fontWeight', 'lineHeight', 'easing', 'opacity', 'zIndex']);

export const fontSizeUnits = ['px', 'rem', 'em', '%', 'vw', 'vh', 'dvh'];

export function fontSizeParts(input: unknown) {
  if (typeof input !== 'number' && typeof input !== 'string') return undefined;
  const match = String(input).trim().match(/^((?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)(px|rem|em|%|vw|vh|dvh)?$/i);
  if (!match || !Number.isFinite(Number(match[1])) || Number(match[1]) <= 0) return undefined;
  return { amount: match[1], unit: match[2]?.toLowerCase() ?? 'px' };
}

export function fontSizeValue(amount: string | number, unit: string) {
  if (!fontSizeUnits.includes(unit)) return undefined;
  const size = fontSizeParts(`${amount}${unit}`);
  if (!size) return undefined;
  return unit === 'px' ? Number(size.amount) : `${Number(size.amount)}${unit}`;
}

export const defaultShadow: Shadow = { x: 0, y: 4, blur: 12, spread: 0, color: '#000000', alpha: 64 };

export function shadowParts(input: unknown): Shadow | undefined {
  if (typeof input !== 'string') return undefined;
  const length = '(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:e[+-]?\\d+)?)px';
  const match = input.trim().match(new RegExp(`^(inset\\s+)?${length}\\s+${length}\\s+${length}\\s+${length}\\s+(#[0-9a-f]{6})([0-9a-f]{2})?$`, 'i'));
  if (!match) return undefined;
  const [x, y, blur, spread] = match.slice(2, 6).map(Number);
  if (![x, y, blur, spread].every(Number.isFinite) || blur < 0) return undefined;
  return {
    x, y, blur, spread, color: match[6].toLowerCase(), alpha: match[7] ? parseInt(match[7], 16) : 255,
    ...(match[1] ? { inset: true } : {}),
  };
}

export function shadowValue({ x, y, blur, spread, color, alpha, inset }: Shadow) {
  return `${inset ? 'inset ' : ''}${x}px ${y}px ${blur}px ${spread}px ${color}${alpha.toString(16).padStart(2, '0')}`;
}

/** 重ねたシャドウ（カンマ区切り）。1つでも読めなければ undefined（Issue #96） */
export function shadowLayers(input: unknown) {
  if (typeof input !== 'string' || !input.trim()) return undefined;
  const layers = input.split(',').map(shadowParts);
  return layers.every((layer): layer is Shadow => Boolean(layer)) ? layers : undefined;
}

export function shadowListValue(layers: Shadow[]) {
  return layers.map((layer) => shadowValue(layer)).join(', ');
}

export function tokenValue(kind: string, input: unknown): TokenLiteral | undefined {
  if (!Object.hasOwn(tokenKinds, kind)) return undefined;
  if (kind === 'textStyle') return textStyleValue(typeof input === 'string' ? safeJson(input) : input);
  if (typeof input !== 'string' && typeof input !== 'number') return undefined;
  const value = String(input).trim();
  // 色は #RRGGBB と、透明度つきの #RRGGBBAA（Issue #114）
  if (kind === 'color') return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) ? value : undefined;
  if (kind === 'fontSize') {
    if (value.startsWith('clamp(') && value.endsWith(')')) {
      const parts = value.slice(6, -1).split(',').map((part) => fontSizeParts(part));
      if (parts.length === 3 && parts.every(Boolean)) return `clamp(${parts.map((part) => `${part!.amount}${part!.unit}`).join(', ')})`;
    }
    const size = fontSizeParts(value);
    return size && fontSizeValue(size.amount, size.unit);
  }
  if (kind === 'shadow') {
    const layers = shadowLayers(value);
    return layers && shadowListValue(layers);
  }
  if (kind === 'easing') {
    return /^(ease|ease-in|ease-out|ease-in-out|linear)$/.test(value)
      || /^cubic-bezier\(\s*(0|1|0?\.\d+)\s*,\s*-?\d*\.?\d+\s*,\s*(0|1|0?\.\d+)\s*,\s*-?\d*\.?\d+\s*\)$/.test(value) ? value : undefined;
  }
  if (kind === 'fontFamily') {
    return value.split(',').every((part) => /^("[A-Za-z0-9][A-Za-z0-9 ]*"|[a-z][a-z-]*)$/.test(part.trim())) ? value : undefined;
  }
  if (!value || !Number.isFinite(Number(value))) return undefined;
  const number = Number(value);
  if (kind === 'letterSpacing') return number;
  if (kind === 'fontWeight') return Number.isInteger(number) && number >= 1 && number <= 1000 ? number : undefined;
  if (kind === 'lineHeight') return number > 0 ? number : undefined;
  if (kind === 'opacity') return number >= 0 && number <= 1 ? number : undefined;
  if (kind === 'zIndex') return Number.isInteger(number) && Math.abs(number) <= 99999 ? number : undefined;
  return number >= 0 ? number : undefined;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

/** 文字スタイルの値：文字サイズは必須。ほかは任意。同じ順で並べ直した新しいオブジェクトを返す（同じ値なら同じ JSON になる） */
function textStyleValue(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const parts = input as Record<string, unknown>;
  if (Object.keys(parts).some((key) => !textStyleParts.some(([name]) => name === key))) return undefined;
  const result: Record<string, string | number> = {};
  for (const [name] of textStyleParts) {
    if (parts[name] === undefined) continue;
    const value = tokenValue(name, parts[name]);
    if (value === undefined || typeof value === 'object') return undefined;
    result[name] = value;
  }
  return result.fontSize === undefined ? undefined : result;
}

/**
 * トークンの実際の値（Issue #114）。モードの値 → 参照（別のトークン）→ 自分の値、の順に決める。
 * slot は { value } か { ref: トークンID }。参照は同じ種類のトークンだけをたどり、循環したら undefined
 */
export function tokenSlot(token: DesignToken, modeId?: string | null): TokenSlot {
  const own = modeId ? token.modes?.[modeId] : undefined;
  if (own && (own.ref || own.value !== undefined)) return own;
  return token.ref ? { ref: token.ref } : { value: token.value };
}

export function tokenLiteral(tokens: readonly DesignToken[], token: DesignToken | undefined, modeId?: string | null, seen = new Set<string>()): TokenLiteral | undefined {
  if (!token || seen.has(token.id)) return undefined;
  seen.add(token.id);
  const slot = tokenSlot(token, modeId);
  if (slot.ref) {
    const target = tokens.find(({ id, kind }) => id === slot.ref && kind === token.kind);
    return tokenLiteral(tokens, target, modeId, seen);
  }
  return tokenValue(token.kind, slot.value);
}

/** 参照が循環するか（id のトークンを ref に向けたとき） */
export function createsCycle(tokens: readonly DesignToken[], id: string, ref: string | undefined) {
  const seen = new Set([id]);
  for (let current: string | undefined = ref; current; current = tokens.find((token) => token.id === current)?.ref) {
    if (seen.has(current)) return true;
    seen.add(current);
  }
  return false;
}

/** プレビュー用：参照とモードを解いた値を value に入れたデザインシステム（編集の保存には使わない） */
export function effectiveDesign<Design extends DesignSystemData | null | undefined>(design: Design, modeId?: string | null): Design {
  if (!design || (!design.tokens?.some((token) => token.ref || token.modes) && !modeId)) return design;
  // 解いた値だけを持たせる（参照やモードを残すと、描画側でもう一度たどってしまう）
  return { ...design, tokens: design.tokens.map((token) => {
    const { ref, modes, ...rest } = token;
    return { ...rest, value: tokenLiteral(design.tokens, token, modeId) ?? token.value };
  }) };
}

type ResolveToken = (token: DesignToken, part?: string) => unknown;

export function resolveElement<Element extends ElementData>(element: Element, { tokens = [] }: { tokens?: readonly DesignToken[] } = {},
  resolveToken: ResolveToken = (token, part) => {
    const literal = tokenLiteral(tokens, token);
    return part ? (literal && typeof literal === 'object' ? literal[part] : undefined) : literal ?? token.value;
  }): Element & { style: Style; tokenRefs: TokenRefs } {
  const style: Style = { ...element.style };
  for (const [property, id] of Object.entries(element.tokenRefs ?? {})) {
    const token = tokens.find((candidate) => candidate.id === id && candidate.kind === propertyKinds[property]);
    if (!token) continue;
    // 文字スタイル：中身の項目に分けて入れる。個別に指定した項目（tokenRefs の fontSize など）は後で上書きする
    if (property === 'textStyle') {
      for (const [part] of textStyleParts) {
        const value = resolveToken(token, part);
        // 個別に決めた値（style・tokenRefs）があれば、そちらを優先する
        if (value !== undefined && !element.tokenRefs?.[part] && element.style?.[part] === undefined) style[part] = value as StyleValue;
      }
      continue;
    }
    style[property] = resolveToken(token) as StyleValue;
  }
  const states = element.states && Object.fromEntries(Object.entries(element.states).map(([id, state]) => [id, state ? {
    ...state, style: resolveElement({ ...element, states: undefined, style: state.style, tokenRefs: state.tokenRefs }, { tokens }, resolveToken).style,
  } : state]));
  return { ...element, tokenRefs: element.tokenRefs ?? {}, style, ...(states ? { states } : {}) };
}

export function tokenChoices(tokens: readonly DesignToken[], property: string) {
  return tokens.filter(({ kind }) => kind === propertyKinds[property]);
}

export function displayTokenValue(kind: string, value: unknown): string {
  if (kind === 'duration') return `${value}ms`;
  if (kind === 'textStyle') {
    const parts = value as Record<string, unknown> | null;
    return parts && typeof parts === 'object' ? textStyleParts.filter(([name]) => parts[name] !== undefined)
      .map(([name]) => displayTokenValue(name, parts[name])).join(' / ') : '';
  }
  return typeof value === 'number' && !unitlessTokenKinds.has(kind) ? `${value}px` : String(value);
}

export function resolveBackground(background: BackgroundSetting | null | undefined, tokens: readonly DesignToken[] = []): string | undefined {
  if (!background) return undefined;
  const value = background.tokenId
    ? tokenLiteral(tokens, tokens.find(({ id, kind }) => id === background.tokenId && kind === 'color'))
    : tokenValue('color', background.color);
  // 色の値は文字列（#RRGGBB）
  return typeof value === 'string' ? value : undefined;
}

// Only editable values participate in overrides. Tree structure belongs to the definition.
const fields: string[] = ['name', 'text', 'src', 'alt', 'imageWidth', 'imageHeight', 'loading', 'level', 'targetScreenId', 'interactions', 'stateBinding', 'action', 'panel', 'motion', 'states', 'stateTransition', 'animations', 'icon', 'iconSize', 'iconPosition', 'imageFit', 'imagePosition', 'decorative', 'loadingView', 'value', 'max', 'panelHistory', 'css', 'repeat', 'dataBind', 'viewTransition', 'stateLinks', 'itemLists', 'i18n', 'combobox', 'comboboxPart'];
const maps = ['style', 'tokenRefs', 'customValues', 'control'];

export function applyValues<Node extends ElementData>(node: Node, patch: ElementPatch | null | undefined): Node {
  if (!patch) return node;
  const values = patch as Partial<ElementData>;
  const tokenRefs = { ...node.tokenRefs };
  for (const property of Object.keys(values.style ?? {})) {
    if (!Object.hasOwn(values.tokenRefs ?? {}, property)) delete tokenRefs[property];
  }
  return { ...node, ...values, style: { ...node.style, ...values.style },
    tokenRefs: { ...tokenRefs, ...values.tokenRefs },
    ...(node.customValues || values.customValues ? { customValues: { ...node.customValues, ...values.customValues } } : {}),
    ...(node.control || values.control ? { control: { ...node.control, ...values.control } } : {}),
    responsive: mergeResponsive(node.responsive, values.responsive) };
}

type Values = Record<string, unknown> & Pick<ElementData, 'responsive'>;

export function changeValues(patch: ElementPatch | undefined, before: Values, after: Values): ElementPatch {
  const next: ElementPatch = { ...patch };
  for (const key of fields) {
    if (after[key] !== before[key]) next[key] = after[key] ?? null;
  }
  const map = (values: Values, key: string) => (values[key] ?? {}) as Record<string, unknown>;
  for (const key of maps) {
    for (const property of new Set([...Object.keys(map(before, key)), ...Object.keys(map(after, key))])) {
      if (map(before, key)[property] !== map(after, key)[property]) {
        next[key] = { ...(next[key] as object | undefined), [property]: map(after, key)[property] ?? null };
      }
    }
  }
  if (before.responsive !== after.responsive) {
    next.responsive = changeResponsive(patch?.responsive as ElementData['responsive'], before.responsive, after.responsive);
  }
  return next;
}

export function definitionRoot(component: DesignComponent): ElementData {
  return component.root ?? {
    id: component.id, type: component.type, ...component.content, style: component.style ?? {},
    tokenRefs: component.tokenRefs, ...(component.type === 'container' ? { children: [] } : {}),
  };
}

export function variantTree(component: DesignComponent, variantId?: string) {
  const variant = component.variants?.find(({ id }) => id === variantId);
  function visit(node: ElementData): ElementData {
    const next = applyValues(node, variant?.values?.[node.id]);
    return node.children ? { ...next, children: node.children.map(visit) } : next;
  }
  return visit(definitionRoot(component));
}

/** 共通部品の入れ子の深さの上限（Issue #207）。循環した不正なデータでも、描画が終わるようにする */
export const maxComponentDepth = 8;

/** 共通部品の定義が直接・間接に参照する共通部品の id（自分を含まない） */
export function componentReferences(components: readonly DesignComponent[], id: string): Set<string> {
  const byId = new Map(components.map((component) => [component.id, component]));
  const found = new Set<string>();
  const visit = (componentId: string) => {
    const component = byId.get(componentId);
    if (!component) return;
    const nodes = [definitionRoot(component), ...(component.variants ?? []).flatMap(() => [])];
    (function walk(list: ElementData[]) {
      for (const node of list) {
        if (node.componentId && !found.has(node.componentId)) { found.add(node.componentId); visit(node.componentId); }
        if (node.children) walk(node.children);
      }
    })(nodes);
  };
  visit(id);
  return found;
}

/** parentId の定義に childId の配置を入れると、循環するか（自分自身・間接の参照） */
export function createsComponentCycle(components: readonly DesignComponent[], parentId: string, childId: string) {
  return parentId === childId || componentReferences(components, childId).has(parentId);
}

/** 定義の中に循環があれば、その部品の id */
export function componentCycles(components: readonly DesignComponent[]) {
  return components.filter(({ id }) => componentReferences(components, id).has(id)).map(({ id }) => id);
}

export function materializeElements(elements: ElementData[], design: Pick<DesignSystemData, 'components'> | null | undefined, stack: string[] = []): ElementData[] {
  return elements.map((element) => {
    const component = design?.components.find(({ id, type }) => id === element.componentId && type === element.type);
    if (!component) return element.children ? { ...element, children: materializeElements(element.children, design, stack) } : element;
    // 入れ子の共通部品（Issue #207）：循環や深すぎる入れ子は、展開せずに止める
    if (stack.includes(component.id) || stack.length >= maxComponentDepth) {
      const { componentId: _skipped, ...rest } = element;
      return { ...rest, children: [], name: `${component.name}（循環のため表示しません）` };
    }
    const inner = [...stack, component.id];

    const root = variantTree(component, element.variantId);
    const partIds = new Map<string, string>([[root.id, element.id]]);
    (function index(nodes: ElementData[]) { for (const node of nodes) { partIds.set(node.id, `${element.id}/${node.id}`); if (node.children) index(node.children); } })(root.children ?? []);
    // 配置ごとの項目（Issue #201）：項目のリストの要素を、配置の項目の数だけ並べ、項目ごとの上書き（文言・画像など）を当てる
    function child(node: ElementData, item?: { id: string; overrides?: Record<string, ElementPatch | undefined> }): ElementData {
      const resolved = applyValues(applyValues(node, element.childOverrides?.[node.id]), item?.overrides?.[node.id]);
      const suffix = item ? `~${item.id}` : '';
      const id = `${element.id}/${node.id}${suffix}`;
      // 定義の中に置いた、別の共通部品の配置（Issue #207）：その部品の定義を展開する。id と状態のスコープは、入れ子の配置ごとに分かれる
      if (resolved.componentId) {
        const [nested] = materializeElements([{ ...resolved, id, ...(resolved.interactions ? { interactions: remapInteractions(resolved.interactions, new Map(), partIds) } : {}) }], design, inner);
        return { ...nested, partId: node.id, nestedIn: element.id, ...(item ? { itemId: item.id } : {}) };
      }
      return {
        ...resolved, id, instanceId: element.id, instanceComponentId: component!.id, partId: node.id, ...(item ? { itemId: item.id } : {}),
        ...(resolved.interactions ? { interactions: remapInteractions(resolved.interactions, new Map(), partIds) } : {}),
        ...(node.children ? { children: node.children.flatMap((next) => children(next, item)) } : {}),
      };
    }
    function children(node: ElementData, item?: { id: string; overrides?: Record<string, ElementPatch | undefined> }): ElementData[] {
      const items = node.itemList && !item ? element.itemLists?.[node.id] : undefined;
      return items?.length ? items.map((entry) => child(node, entry)) : [child(node, item)];
    }
    const { children: ownChildren, ...values } = element;
    const merged = applyValues(root, values);
    const resolved = { ...merged, ...(merged.interactions ? { interactions: remapInteractions(merged.interactions, new Map(), partIds) } : {}) };
    return root.children ? {
      ...resolved, children: [...root.children.flatMap((node) => children(node)), ...materializeElements(ownChildren ?? [], design, stack)],
    } : resolved;
  });
}

export function createComponentFromElement(element: ElementData, name: string, id: string, variables: StateDefinition[] = []) {
  const childOverrides: NonNullable<ElementData['childOverrides']> = {};
  function capture(node: ElementData): ElementData {
    const { targetScreenId, action, children, ...values } = node;
    if (node !== element && (targetScreenId || action)) childOverrides[node.id] = { targetScreenId, action };
    return { ...values, ...(children ? { children: children.map(capture) } : {}) };
  }
  const root = capture(element);
  const local = variablesForElements([element], variables);
  const component: DesignComponent = { id, name, type: root.type, root, variants: [], ...(local.length ? { variables: structuredClone(local) } : {}) };
  const instance: ElementData = {
    id: element.id, type: element.type, componentId: id, targetScreenId: element.targetScreenId,
    action: element.action, style: {}, childOverrides,
  };
  return { component, instance };
}
