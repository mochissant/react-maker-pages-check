// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { DatasetData, DesignSystemData, ElementData, ScreenData, SiteAction, StateBinding, StateDefinition, StateValue } from './model-types.ts';
import { expressionProblem, expressionStateIds, isStateExpression } from './state-expressions.ts';

export type StateAction = Extract<SiteAction, { stateId: string }>;
export type StateSlot = { definition: StateDefinition; key: string; scope: string; label: string };
export const isStateAction = (action: SiteAction): action is StateAction => action.type === 'setState' || action.type === 'toggleState' || action.type === 'incrementState';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 10000;
export const isStateValue = (value: unknown): value is StateValue => typeof value === 'boolean' || text(value) || typeof value === 'number' && Number.isFinite(value);
export function validStateValue(definition: StateDefinition, value: unknown): value is StateValue {
  return definition.type === 'boolean' ? typeof value === 'boolean' : definition.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : definition.type === 'text' ? text(value) : text(value) && Boolean(definition.options?.includes(value));
}
export function validVariables(value: unknown): value is StateDefinition[] {
  if (!Array.isArray(value) || value.length > 50) return false;
  const ids = new Set<string>(); const names = new Set<string>();
  const valid = value.every((item: unknown) => {
    if (!object(item) || !text(item.id) || !item.id || item.id.length > 200 || ids.has(item.id) || !text(item.name) || !item.name.trim() || item.name.length > 100 || names.has(item.name.trim())) return false;
    if (typeof item.type !== 'string' || !['boolean', 'text', 'number', 'choice'].includes(item.type)) return false;
    if (item.type === 'choice' && (!Array.isArray(item.options) || !item.options.length || item.options.length > 50 || !item.options.every((entry: unknown) => text(entry) && Boolean(entry.trim())) || new Set(item.options).size !== item.options.length)) return false;
    ids.add(item.id); names.add(item.name.trim());
    return validStateValue(item as StateDefinition, item.initial) && (item.expression === undefined || isStateExpression(item.expression));
  });
  return valid && (value as StateDefinition[]).every((item) => !expressionProblem(item, value as StateDefinition[]));
}
function find(elements: ElementData[], id: string): ElementData | undefined {
  for (const item of elements) { if (item.id === id) return item; const child = item.children && find(item.children, id); if (child) return child; }
}
/** 部品の状態をつなげられる画面の状態：計算値でなく、型（選択肢なら選択肢も）が同じもの */
export function linkableScreenVariables(variable: StateDefinition, variables: StateDefinition[] | undefined) {
  return (variables ?? []).filter((item) => !item.expression && !variable.expression && item.type === variable.type
    && (item.type !== 'choice' || JSON.stringify(item.options ?? []) === JSON.stringify(variable.options ?? [])));
}
function linkedScreenVariable(variable: StateDefinition, linkId: string | undefined, variables: StateDefinition[] | undefined) {
  return linkId ? linkableScreenVariables(variable, variables).find(({ id }) => id === linkId) : undefined;
}
export function stateSlots(element: ElementData, screen: Pick<ScreenData, 'id' | 'name' | 'variables' | 'elements'>, design?: Pick<DesignSystemData, 'components'> | null): StateSlot[] {
  // 入れ子の共通部品（Issue #207）の中の要素は、画面の要素に配置が無いので、描画時に付いた instanceComponentId で定義を決める
  const instance = element.instanceId ? find(screen.elements, element.instanceId) ?? (element.instanceComponentId ? { id: element.instanceId, type: 'container', componentId: element.instanceComponentId } : undefined)
    : element.componentId ? element : undefined;
  const definition = design?.components.find(({ id }) => id === (element.instanceComponentId ?? instance?.componentId));
  const slot = (variable: StateDefinition, instanceId?: string): StateSlot => {
    // 外とつないだ部品の状態（Issue #201）：画面の状態と同じ値を使う（双方向）。型と選択肢が同じときだけ
    const linked = instanceId ? linkedScreenVariable(variable, instance?.stateLinks?.[variable.id], screen.variables) : undefined;
    if (linked) return { definition: variable, scope: JSON.stringify([screen.id, null]), key: `rm-variable:${JSON.stringify([screen.id, null, linked.id])}`, label: screen.name };
    return { definition: variable, scope: JSON.stringify([screen.id, instanceId ?? null]),
      key: `rm-variable:${JSON.stringify([screen.id, instanceId ?? null, variable.id])}`, label: instanceId ? instance?.name || definition?.name || '部品' : screen.name };
  };
  // 部品の状態は配置ごと。画面の状態も、配置側で付けた条件から参照できる。
  const slots = [...(definition?.variables ?? []).map((variable) => slot(variable, instance!.id)), ...(screen.variables ?? []).map((variable) => slot(variable))];
  return slots.filter(({ definition }, index) => slots.findIndex((item) => item.definition.id === definition.id) === index);
}
export function screenStateSlots(screen: ScreenData, design?: Pick<DesignSystemData, 'components'> | null): StateSlot[] {
  const slots = stateSlots({ id: '', type: 'container' }, screen, design);
  const counts = new Map<string, number>();
  const visit = (elements: ElementData[]) => { for (const item of elements) {
    if (item.componentId) {
      const count = (counts.get(item.componentId) ?? 0) + 1; counts.set(item.componentId, count);
      slots.push(...stateSlots(item, screen, design).filter(({ scope }) => scope !== JSON.stringify([screen.id, null])).map((slot) => ({ ...slot, label: item.name || `${slot.label} ${count}` })));
    }
    if (item.children) visit(item.children);
  } };
  visit(screen.elements);
  // 入れ子の共通部品（Issue #207）：定義の中の配置も、外の配置ごとに状態を持つ（id は 外/中）
  const nested = (componentId: string, instanceId: string, depth: number) => {
    const component = design?.components.find(({ id }) => id === componentId);
    if (!component?.root || depth >= 8) return;
    const walk = (nodes: ElementData[]) => { for (const node of nodes) {
      if (node.componentId) {
        const id = `${instanceId}/${node.id}`;
        slots.push(...stateSlots({ id: `${id}/x`, type: 'container', instanceId: id, instanceComponentId: node.componentId }, screen, design).filter(({ scope }) => scope !== JSON.stringify([screen.id, null])));
        nested(node.componentId, id, depth + 1);
      }
      if (node.children) walk(node.children);
    } };
    walk(component.root.children ?? []);
  };
  const instances = (elements: ElementData[]) => { for (const item of elements) { if (item.componentId) nested(item.componentId, item.id, 0); if (item.children) instances(item.children); } };
  instances(screen.elements);
  return slots;
}
export function validStateAction(action: StateAction, definitions: StateDefinition[]): boolean {
  const definition = definitions.find(({ id }) => id === action.stateId);
  return Boolean(definition && !definition.expression && (action.type === 'setState' ? validStateValue(definition, action.value) : action.type === 'toggleState' ? definition.type === 'boolean' : definition.type === 'number' && Number.isFinite(action.amount)));
}
export function nextStateValue(action: StateAction, definition: StateDefinition, current: StateValue): StateValue {
  if (!validStateAction(action, [definition])) throw new Error('状態の型と動作を確認してください。');
  const next = action.type === 'setState' ? action.value : action.type === 'toggleState' ? !current : Number(current) + action.amount;
  if (!validStateValue(definition, next)) throw new Error('状態の値が範囲外です。');
  return next;
}
export function validStateBinding(value: unknown, definitions: StateDefinition[], variants?: string[]): value is StateBinding {
  if (!object(value)) return false;
  const get = (entry: Record<string, unknown>) => definitions.find(({ id }) => id === entry.stateId);
  if (value.input !== undefined) {
    if (!object(value.input)) return false;
    const definition = get(value.input);
    if (!definition || definition.type !== 'text' || definition.expression) return false;
  }
  if (value.visible !== undefined) {
    if (!object(value.visible)) return false;
    const definition = get(value.visible);
    if (!definition || typeof value.visible.operator !== 'string' || !['eq', 'ne'].includes(value.visible.operator) || !validStateValue(definition, value.visible.value)) return false;
  }
  if (value.style !== undefined) {
    const entry = value.style;
    if (!object(entry)) return false;
    const definition = get(entry);
    if (!definition || typeof entry.operator !== 'string' || !['eq', 'ne'].includes(entry.operator) || !validStateValue(definition, entry.value) || !object(entry.values) || Object.keys(entry.values).length > 200) return false;
    let count = 0;
    const serializable = (item: unknown, depth = 0): boolean => {
      if (++count > 2000 || depth > 8) return false;
      if (item === null || typeof item === 'boolean') return true;
      if (typeof item === 'number') return Number.isFinite(item);
      if (typeof item === 'string') return true;
      if (Array.isArray(item)) return item.every((value) => serializable(value, depth + 1));
      return object(item) && Object.entries(item).every(([key, value]) => !['__proto__', 'constructor', 'prototype'].includes(key) && serializable(value, depth + 1));
    };
    if (!serializable(entry.values)) return false;
  }
  if (value.text !== undefined && (!object(value.text) || !get(value.text) || ['prefix', 'suffix'].some((key) => value.text && object(value.text) && value.text[key] !== undefined && !text(value.text[key])))) return false;
  if (value.variant !== undefined) {
    if (!object(value.variant) || !object(value.variant.values) || Object.keys(value.variant.values).length > 50) return false;
    const definition = get(value.variant);
    if (!definition || !['choice', 'boolean'].includes(definition.type)) return false;
    const choices = definition.type === 'boolean' ? ['false', 'true'] : definition.options ?? [];
    if (!Object.keys(value.variant.values).every((key) => choices.includes(key))) return false;
    if (!Object.values(value.variant.values).every((id) => text(id) && (!id || variants?.includes(id)))) return false;
  }
  return true;
}
export function usesVariable(elements: ElementData[], id: string): boolean {
  const used = (item: Partial<ElementData>): boolean => Boolean(item.interactions?.some(({ actions }) => actions.some((action) => 'stateId' in action && action.stateId === id))
    || Object.values(item.stateBinding ?? {}).some((entry) => entry?.stateId === id)
    || item.children?.some(used) || Object.values(item.childOverrides ?? {}).some((patch) => patch && used(patch)));
  return elements.some(used);
}

/** 部品へ登録するときは、計算値が参照する状態も一緒に移す。 */
export function variablesForElements(elements: ElementData[], variables: StateDefinition[]): StateDefinition[] {
  const needed = new Set(variables.filter(({ id }) => usesVariable(elements, id)).map(({ id }) => id));
  let previous = -1;
  while (previous !== needed.size) {
    previous = needed.size;
    for (const variable of variables) if (needed.has(variable.id)) for (const id of expressionStateIds(variable.expression)) needed.add(id);
  }
  return variables.filter(({ id }) => needed.has(id));
}

export function cleanStateLinks(element: ElementData, variables: StateDefinition[], design?: Pick<DesignSystemData, 'components'>): ElementData {
  const component = design?.components.find(({ id }) => id === element.componentId);
  const available = [...(component?.variables ?? []), ...variables];
  const variants = component?.variants?.map(({ id }) => id);
  function clean(values: Partial<ElementData>): Partial<ElementData> {
    const binding = values.stateBinding && Object.fromEntries(Object.entries(values.stateBinding).filter(([key, entry]) => entry && validStateBinding({ [key]: entry }, available, variants)));
    return { ...values, ...(values.stateBinding ? { stateBinding: binding && Object.keys(binding).length ? binding : undefined } : {}),
      ...(values.interactions ? { interactions: values.interactions.flatMap((entry) => {
        const actions = entry.actions.filter((action) => !isStateAction(action) || validStateAction(action, available));
        return actions.length ? [{ ...entry, actions }] : [];
      }) } : {}) };
  }
  return { ...element, ...clean(element), ...(element.children ? { children: element.children.map((child) => cleanStateLinks(child, variables, design)) } : {}),
    ...(element.childOverrides ? { childOverrides: Object.fromEntries(Object.entries(element.childOverrides).map(([id, patch]) => [id, patch && clean(patch)])) } : {}) };
}

/** 復元時は、状態の型と参照を、画面・共通部品それぞれの定義で検査する。 */
export function stateProjectErrors(project: { screens: ScreenData[]; designSystem?: Pick<DesignSystemData, 'components'>; datasets?: DatasetData[] }): string[] {
  const errors: string[] = [];
  const components = project.designSystem?.components ?? [];
  const definitions = (variables: StateDefinition[] | undefined, name: string) => {
    if (variables !== undefined && !validVariables(variables)) errors.push(`${name}の状態の定義`);
    else for (const variable of variables ?? []) {
      const problem = expressionProblem(variable, variables ?? [], project.datasets ?? []);
      if (problem) errors.push(`${name}の計算した値「${variable.name}」：${problem}`);
    }
  };
  for (const component of components) definitions(component.variables, component.name);
  for (const screen of project.screens) definitions(screen.variables, screen.name);
  if (errors.length) return errors;
  function values(node: Partial<ElementData>, variables: StateDefinition[], name: string, variants?: string[]) {
    if (node.stateBinding != null && !validStateBinding(node.stateBinding, variables, variants)) errors.push(`${name}の状態の結び付け`);
    for (const entry of node.interactions ?? []) for (const action of entry.actions) {
      if (isStateAction(action) && !validStateAction(action, variables)) errors.push(`${name}の状態の動作`);
    }
  }
  function tree(elements: ElementData[], variables: StateDefinition[], name: string, ownVariants?: string[]) {
    for (const node of elements) {
      const component = components.find(({ id }) => id === node.componentId);
      const available = [...(component?.variables ?? []), ...variables];
      const variants = component ? (component.variants ?? []).map(({ id }) => id) : ownVariants;
      values(node, available, name, variants);
      for (const patch of Object.values(node.childOverrides ?? {})) if (patch) values(patch, available, name, variants);
      if (node.children) tree(node.children, variables, name);
    }
  }
  for (const component of components) {
    const variants = (component.variants ?? []).map(({ id }) => id);
    if (component.root) tree([component.root], component.variables ?? [], component.name, variants);
    for (const variant of component.variants ?? []) for (const patch of Object.values(variant.values ?? {})) if (patch) values(patch, component.variables ?? [], component.name, variants);
  }
  for (const screen of project.screens) {
    tree(screen.elements, screen.variables ?? [], screen.name);
  }
  return errors;
}
