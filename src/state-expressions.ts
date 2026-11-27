// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import type { DatasetData, StateDefinition, StateExpression, StateValue } from './model-types.ts';

type ValueType = 'boolean' | 'number' | 'text';
type Slot = { definition: StateDefinition; scope: string; key: string };
export type StateResult = { value: StateValue; error?: string };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const scalar = (value: unknown): value is StateValue => typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && value.length <= 10000;
const operators = ['+', '-', '*', '/', '%', '**', '===', '!==', '<', '<=', '>', '>=', '&&', '||'];
const functions = ['min', 'max', 'round', 'abs', 'length', 'text'];
const declaredType = (definition: StateDefinition): ValueType => definition.type === 'choice' ? 'text' : definition.type;
function matches(definition: StateDefinition, value: unknown): value is StateValue {
  return scalar(value) && typeof value === (declaredType(definition) === 'text' ? 'string' : definition.type) && (definition.type !== 'choice' || Boolean(definition.options?.includes(String(value))));
}

/** 保存するのは上限付きの計算データだけ。構文木の任意の命令やプロパティは受け付けない。 */
export function isStateExpression(value: unknown): value is StateExpression {
  let count = 0;
  function valid(node: unknown, depth = 0): boolean {
    if (!object(node) || ++count > 200 || depth > 20) return false;
    const shape = (keys: string[]) => Object.keys(node).every((key) => key === 'kind' || keys.includes(key));
    const child = (value: unknown) => valid(value, depth + 1);
    switch (node.kind) {
      case 'value': return shape(['value']) && scalar(node.value);
      case 'state': return shape(['id']) && id(node.id);
      case 'count': return shape(['datasetId']) && id(node.datasetId);
      case 'sum': return shape(['datasetId', 'fieldId']) && id(node.datasetId) && id(node.fieldId);
      case 'unary': return shape(['op', 'value']) && typeof node.op === 'string' && ['!', '+', '-'].includes(node.op) && child(node.value);
      case 'binary': return shape(['op', 'left', 'right']) && typeof node.op === 'string' && operators.includes(node.op) && child(node.left) && child(node.right);
      case 'if': return shape(['condition', 'yes', 'no']) && child(node.condition) && child(node.yes) && child(node.no);
      case 'fn': return shape(['name', 'args']) && typeof node.name === 'string' && functions.includes(node.name) && Array.isArray(node.args) && node.args.length > 0 && node.args.length <= 10 && node.args.every(child);
      default: return false;
    }
  }
  return valid(value);
}

/** 戻り値の型・参照・循環を検査する。データ一覧が渡された場合は項目の型も検査する。 */
export function expressionType(expression: StateExpression, variables: StateDefinition[], datasets?: DatasetData[]): ValueType {
  if (!isStateExpression(expression)) throw new Error('式の形、長さ、深さを確認してください。');
  const visiting = new Set<string>(); const types = new Map<string, ValueType>();
  function requireType(actual: ValueType, expected: ValueType) { if (actual !== expected) throw new Error(`式には${({ number: '数', text: '文字', boolean: 'はい／いいえ' })[expected]}を使ってください。`); }
  function walk(node: StateExpression): ValueType {
    switch (node.kind) {
      case 'value': return typeof node.value === 'string' ? 'text' : typeof node.value === 'number' ? 'number' : 'boolean';
      case 'state': {
        const definition = variables.find(({ id }) => id === node.id);
        if (!definition) throw new Error('参照している状態が見つかりません。');
        if (visiting.has(node.id)) throw new Error('計算した値が循環しています。');
        if (types.has(node.id)) return types.get(node.id)!;
        visiting.add(node.id);
        const type = definition.expression ? walk(definition.expression) : declaredType(definition);
        requireType(type, declaredType(definition)); visiting.delete(node.id); types.set(node.id, type);
        return type;
      }
      case 'count': case 'sum': {
        if (datasets) {
          const dataset = datasets.find(({ id }) => id === node.datasetId);
          if (!dataset) throw new Error('参照しているデータが見つかりません。');
          if (node.kind === 'sum' && dataset.fields.find(({ id }) => id === node.fieldId)?.type !== 'number') throw new Error('合計には、データの数の項目を選んでください。');
        }
        return 'number';
      }
      case 'unary': requireType(walk(node.value), node.op === '!' ? 'boolean' : 'number'); return node.op === '!' ? 'boolean' : 'number';
      case 'binary': {
        const left = walk(node.left); const right = walk(node.right);
        if (node.op === '&&' || node.op === '||') { requireType(left, 'boolean'); requireType(right, 'boolean'); return 'boolean'; }
        if (node.op === '===' || node.op === '!==') { requireType(left, right); return 'boolean'; }
        if (['<', '<=', '>', '>='].includes(node.op)) { if (left === 'boolean') throw new Error('大小の比較には数か文字を使ってください。'); requireType(left, right); return 'boolean'; }
        if (node.op === '+' && left === 'text') { requireType(right, 'text'); return 'text'; }
        requireType(left, 'number'); requireType(right, 'number'); return 'number';
      }
      case 'if': { requireType(walk(node.condition), 'boolean'); const yes = walk(node.yes); requireType(walk(node.no), yes); return yes; }
      case 'fn': {
        if (!['min', 'max'].includes(node.name) && node.args.length !== 1) throw new Error('この関数に渡す値は1つです。');
        if (node.name === 'text') { walk(node.args[0]); return 'text'; }
        for (const arg of node.args) requireType(walk(arg), node.name === 'length' ? 'text' : 'number');
        return 'number';
      }
    }
  }
  return walk(expression);
}
export function expressionProblem(variable: StateDefinition, variables: StateDefinition[], datasets?: DatasetData[]): string | null {
  if (variable.expression === undefined) return null;
  try {
    if (expressionType(variable.expression, variables, datasets) !== declaredType(variable)) return '式の結果と、計算した値の型が違います。';
    return null;
  } catch (error) { return error instanceof Error ? error.message : '式を確認してください。'; }
}
export function expressionStateIds(expression: StateExpression | undefined): string[] {
  if (!expression || !isStateExpression(expression)) return [];
  switch (expression.kind) {
    case 'state': return [expression.id];
    case 'unary': return expressionStateIds(expression.value);
    case 'binary': return [...expressionStateIds(expression.left), ...expressionStateIds(expression.right)];
    case 'if': return [...expressionStateIds(expression.condition), ...expressionStateIds(expression.yes), ...expressionStateIds(expression.no)];
    case 'fn': return expression.args.flatMap(expressionStateIds);
    default: return [];
  }
}

function evaluate(expression: StateExpression, state: (id: string) => StateValue, datasets: DatasetData[]): StateValue {
  const run = (node: StateExpression): StateValue => evaluate(node, state, datasets);
  let result: StateValue;
  switch (expression.kind) {
    case 'value': result = expression.value; break;
    case 'state': result = state(expression.id); break;
    case 'count': case 'sum': {
      const dataset = datasets.find(({ id }) => id === expression.datasetId);
      if (!dataset || ['loading', 'error', 'unknown'].includes(dataset.status ?? '')) throw new Error('計算に使うデータを確認してください。');
      result = expression.kind === 'count' ? dataset.records.length : dataset.records.reduce((sum, record) => {
        const value = record.values[expression.fieldId];
        if (value === undefined || value === null) return sum;
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('合計する項目に数以外が含まれています。');
        return sum + value;
      }, 0); break;
    }
    case 'unary': { const value = run(expression.value); result = expression.op === '!' ? !value : expression.op === '-' ? -Number(value) : Number(value); break; }
    case 'if': result = run(expression.condition) ? run(expression.yes) : run(expression.no); break;
    case 'binary': {
      const left = run(expression.left);
      // 条件分岐と同じく、選ばれなかった側の計算は行わない。
      if (expression.op === '&&') { result = Boolean(left) && Boolean(run(expression.right)); break; }
      if (expression.op === '||') { result = Boolean(left) || Boolean(run(expression.right)); break; }
      const right = run(expression.right);
      switch (expression.op) {
        case '+': result = typeof left === 'string' && typeof right === 'string' ? left + right : Number(left) + Number(right); break;
        case '-': result = Number(left) - Number(right); break;
        case '*': result = Number(left) * Number(right); break;
        case '/': result = Number(left) / Number(right); break;
        case '%': result = Number(left) % Number(right); break;
        case '**': result = Number(left) ** Number(right); break;
        case '===': result = left === right; break;
        case '!==': result = left !== right; break;
        case '<': result = left < right; break;
        case '<=': result = left <= right; break;
        case '>': result = left > right; break;
        case '>=': result = left >= right; break;
      }
      break;
    }
    case 'fn': {
      const values = expression.args.map(run);
      result = expression.name === 'text' ? String(values[0]) : expression.name === 'length' ? Array.from(String(values[0])).length
        : expression.name === 'min' ? Math.min(...values.map(Number)) : expression.name === 'max' ? Math.max(...values.map(Number))
          : expression.name === 'round' ? Math.round(Number(values[0])) : Math.abs(Number(values[0]));
      break;
    }
  }
  if (!scalar(result)) throw new Error('計算結果が数や文字の範囲外です。0で割る計算などを確認してください。');
  return result;
}

/** scope は画面か部品の配置。参照名や他の配置に影響されず、同じ範囲のIDだけを読む。 */
export function stateResults(slots: Slot[], values: ReadonlyMap<string, unknown>, datasets: DatasetData[] = []): Map<string, StateResult> {
  const results = new Map<string, StateResult>(); const visiting = new Set<string>();
  const byScope = new Map(slots.map((slot) => [JSON.stringify([slot.scope, slot.definition.id]), slot]));
  function resolve(slot: Slot): StateResult {
    const known = results.get(slot.key); if (known) return known;
    const definition = slot.definition;
    try {
      if (visiting.has(slot.key)) throw new Error('計算した値が循環しています。');
      visiting.add(slot.key);
      const value = definition.expression ? (() => {
        if (!isStateExpression(definition.expression)) throw new Error('式の形を確認してください。');
        return evaluate(definition.expression, (id) => {
          const reference = byScope.get(JSON.stringify([slot.scope, id]));
          if (!reference) throw new Error('参照している状態が見つかりません。');
          const next = resolve(reference); if (next.error) throw new Error(next.error); return next.value;
        }, datasets);
      })() : matches(definition, values.get(slot.key)) ? values.get(slot.key) as StateValue : definition.initial;
      if (!matches(definition, value)) throw new Error('計算結果の型や選択肢を確認してください。');
      const result = { value }; results.set(slot.key, result); return result;
    } catch (error) {
      const result = { value: definition.initial, error: error instanceof Error ? error.message : '計算できません。' }; results.set(slot.key, result); return result;
    } finally { visiting.delete(slot.key); }
  }
  for (const slot of slots) resolve(slot);
  return results;
}

export function expressionText(expression: StateExpression, variables: StateDefinition[], datasets: DatasetData[] = []): string {
  const format = (node: StateExpression): string => expressionText(node, variables, datasets);
  switch (expression.kind) {
    case 'value': return JSON.stringify(expression.value);
    case 'state': return `state(${JSON.stringify(variables.find(({ id }) => id === expression.id)?.name ?? expression.id)})`;
    case 'count': case 'sum': {
      const dataset = datasets.find(({ id }) => id === expression.datasetId);
      // 同名のデータがある場合だけIDで区別する。
      const name = dataset && datasets.filter(({ name }) => name === dataset.name).length === 1 ? dataset.name : expression.datasetId;
      if (expression.kind === 'count') return `count(${JSON.stringify(name)})`;
      const field = dataset?.fields.find(({ id }) => id === expression.fieldId);
      const fieldName = field && dataset!.fields.filter(({ label }) => label === field.label).length === 1 ? field.label : expression.fieldId;
      return `sum(${JSON.stringify(name)}, ${JSON.stringify(fieldName)})`;
    }
    case 'unary': return `(${expression.op}${format(expression.value)})`;
    case 'binary': return `(${format(expression.left)} ${expression.op} ${format(expression.right)})`;
    case 'if': return `(${format(expression.condition)} ? ${format(expression.yes)} : ${format(expression.no)})`;
    case 'fn': return `${expression.name}(${expression.args.map(format).join(', ')})`;
  }
}
