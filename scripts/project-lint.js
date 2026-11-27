// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * プロジェクトの検証（Issue #116）。エージェントが src/generated/project.json を直接書き換えたあとに、機械的に確かめる。
 * 状態の検査は共有ランタイムと共用し、書き出したリポジトリ（scripts/project-lint.js）でも同じものを使う。
 * 戻り値：{ ok, errors: [{ code, path, message }], warnings: [...] }。path は JSON Pointer（RFC 6901）
 */
import { stateProjectErrors } from '../src/state-logic.ts';
import { validControl } from '../src/controls.ts';
import { validCombobox, comboboxParts, comboboxStructureProblem } from '../src/combobox.ts';

const elementTypes = new Set(['container', 'heading', 'text', 'image', 'button', 'icon', 'progress', 'spinner', 'custom',
  'data-list', 'data-detail', 'catalog', 'cart', 'review', 'receipt', 'input', 'textarea', 'select', 'label', 'fieldset']);

/** スタイルの項目 → トークンの種類（design-system.ts と同じ対応） */
const propertyKinds = {
  color: 'color', backgroundColor: 'color', borderColor: 'color', fontSize: 'fontSize', padding: 'spacing', gap: 'spacing',
  boxShadow: 'shadow', borderWidth: 'borderWidth', borderRadius: 'radius', fontWeight: 'fontWeight', lineHeight: 'lineHeight',
  letterSpacing: 'letterSpacing', fontFamily: 'fontFamily', opacity: 'opacity', zIndex: 'zIndex', textStyle: 'textStyle',
  ...Object.fromEntries(['Top', 'Right', 'Bottom', 'Left'].flatMap((side) => [[`padding${side}`, 'spacing'], [`margin${side}`, 'spacing'], [`border${side}Width`, 'borderWidth']])),
  ...Object.fromEntries(['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((corner) => [`border${corner}Radius`, 'radius'])),
};

const motionTriggers = new Set(['appear', 'inView', 'exit', 'hover', 'press', 'focus', 'loaded', 'added', 'error', 'scroll', 'action']);
const pointer = (...parts) => `/${parts.map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function lintProject(input, { components: registered } = {}) {
  const errors = [];
  const warnings = [];
  const error = (code, path, message) => errors.push({ code, path, message });
  const warn = (code, path, message) => warnings.push({ code, path, message });
  const project = isObject(input?.project) && input.format ? input.project : input;
  if (!isObject(project)) {
    error('not-object', '', 'プロジェクトの JSON オブジェクトではありません。');
    return { ok: false, errors, warnings };
  }
  if (!Array.isArray(project.screens)) error('screens', '/screens', 'screens は配列にします。');
  const screens = Array.isArray(project.screens) ? project.screens : [];
  const design = isObject(project.designSystem) ? project.designSystem : { tokens: [], components: [] };
  const tokens = Array.isArray(design.tokens) ? design.tokens : [];
  const components = Array.isArray(design.components) ? design.components : [];
  const datasets = Array.isArray(project.datasets) ? project.datasets : [];
  const screenIds = new Set(screens.map(({ id }) => id));
  const tokensById = new Map(tokens.map((token) => [token.id, token]));
  const componentIds = new Set(components.map(({ id }) => id));
  const datasetIds = new Set(datasets.map(({ id }) => id));
  const usedTokens = new Set();

  // 共通部品の入れ子の循環（Issue #207）：定義の中に、自分自身を（間接にでも）置いていないか
  const references = new Map(components.map((component) => {
    const found = new Set();
    (function walk(node) { if (!node || typeof node !== 'object') return; if (node.componentId) found.add(node.componentId); (node.children ?? []).forEach(walk); })(component?.root);
    return [component?.id, found];
  }));
  components.forEach((component, index) => {
    const seen = new Set();
    const stack = [...(references.get(component?.id) ?? [])];
    while (stack.length) {
      const next = stack.pop();
      if (next === component?.id) { error('component-cycle', pointer('designSystem', 'components', index), `共通部品「${component.name ?? component.id}」が、中に自分自身を（間接に）置いています。`); break; }
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(references.get(next) ?? []));
    }
  });
  if (project.startScreenId != null && !screenIds.has(project.startScreenId)) error('start-screen', '/startScreenId', `開始画面 ${project.startScreenId} がありません。`);
  const seenScreens = new Set();
  screens.forEach((screen, index) => {
    if (typeof screen?.id !== 'string' || !screen.id) error('screen-id', pointer('screens', index, 'id'), '画面の id は空でない文字列にします。');
    else if (seenScreens.has(screen.id)) error('duplicate-id', pointer('screens', index, 'id'), `画面の id ${screen.id} が重複しています。`);
    seenScreens.add(screen?.id);
    if (typeof screen?.name !== 'string') error('screen-name', pointer('screens', index, 'name'), '画面の name は文字列にします。');
    if (screen?.background?.tokenId) { usedTokens.add(screen.background.tokenId); if (!tokensById.has(screen.background.tokenId)) error('token-ref', pointer('screens', index, 'background', 'tokenId'), 'トークンが見つかりません。'); }
  });
  if (project.background?.tokenId) usedTokens.add(project.background.tokenId);

  tokens.forEach((token, index) => {
    if (token.ref) {
      usedTokens.add(token.ref);
      const target = tokensById.get(token.ref);
      if (!target || target.kind !== token.kind) error('token-ref', pointer('designSystem', 'tokens', index, 'ref'), `参照先のトークン ${token.ref} が無いか、種類が違います。`);
    }
    for (const [mode, slot] of Object.entries(token.modes ?? {})) {
      if (!(design.modes ?? []).some(({ id }) => id === mode)) error('token-mode', pointer('designSystem', 'tokens', index, 'modes', mode), `モード ${mode} がありません。`);
      if (slot?.ref) usedTokens.add(slot.ref);
    }
  });

  function visit(elements, path, ids, owner) {
    if (!Array.isArray(elements)) { error('elements', path, 'elements・children は配列にします。'); return; }
    elements.forEach((element, index) => {
      const at = [...path, index];
      const where = pointer(...at);
      if (!isObject(element)) { error('element', where, '要素はオブジェクトにします。'); return; }
      if (typeof element.id !== 'string' || !element.id) error('element-id', `${where}/id`, '要素の id は空でない文字列にします。');
      else if (ids.has(element.id)) error('duplicate-id', `${where}/id`, `要素の id ${element.id} が重複しています。`);
      ids.add(element.id);
      if (!elementTypes.has(element.type)) error('element-type', `${where}/type`, `要素の type「${element.type}」は使えません（${[...elementTypes].join('・')}）。`);
      if (element.control != null && !validControl(element.control)) error('control', `${where}/control`, '入力要素の設定を確認してください。');
      if (element.combobox != null && !validCombobox(element.combobox)) error('combobox', `${where}/combobox`, '検索欄の候補の設定を確認してください。');
      if (element.combobox && comboboxStructureProblem(element)) error('combobox-parts', where, comboboxStructureProblem(element));
      if (element.comboboxPart != null && !comboboxParts.includes(element.comboboxPart)) error('combobox-part', where, '検索欄の中での役割を確認してください。');
      if (element.targetScreenId && !screenIds.has(element.targetScreenId)) error('target-screen', `${where}/targetScreenId`, `遷移先の画面 ${element.targetScreenId} がありません。`);
      if (element.interactions !== undefined) {
        if (!Array.isArray(element.interactions)) error('interactions', `${where}/interactions`, '操作は配列で定義します。');
        else element.interactions.forEach((entry, interactionIndex) => {
          const at = `${where}/interactions/${interactionIndex}`;
          if (!['click', 'hover', 'focus', 'visible', 'key'].includes(entry?.trigger) || !Array.isArray(entry?.actions) || !entry.actions.length) { error('interaction-trigger', at, 'きっかけと動作を確認してください。'); return; }
          entry.actions.forEach((action, actionIndex) => {
            const location = `${at}/actions/${actionIndex}`;
            if (!['navigate', 'back', 'openOverlay', 'closeOverlay', 'setState', 'toggleState', 'incrementState', 'link', 'scroll', 'toast', 'dismissToast', 'copy', 'phone', 'email', 'submit', 'reset', 'call', 'playMotion'].includes(action?.type)) error('action-type', location, '動作の種類を確認してください。');
            if (['navigate', 'openOverlay'].includes(action?.type) && !screenIds.has(action.screenId)) error('target-screen', `${location}/screenId`, '操作の移動先がありません。');
            if (action?.type === 'openOverlay' && !project.screens.find(({ id }) => id === action.screenId)?.overlay) error('target-overlay', `${location}/screenId`, '重ねて出す画面を指定してください。');
            // 通知の見た目（Issue #241）：消した共通部品を指していれば、標準の通知で出す
            if (action?.type === 'toast' && action.componentId && !componentIds.has(action.componentId)) warn('toast-component', `${location}/componentId`, `通知の部品 ${action.componentId} がありません（標準の通知で出します）。`);
            // 参照切れ（Issue #238）：スクロール・動きの再生の対象が、同じ画面に無い（セクションを消したなど）
            if (['scroll', 'playMotion'].includes(action?.type) && typeof action.targetId === 'string' && !action.targetId.includes('/') && !screenElementIds.has(action.targetId)) {
              warn('scroll-target', `${location}/targetId`, `${action.type === 'scroll' ? 'スクロール先' : '動かす要素'}の要素 ${action.targetId} が、この画面にありません。`);
            }
            if (action?.type === 'link') {
              let safe = false;
              try { safe = typeof action.url === 'string' && Boolean(action.url.trim()) && !/[\u0000-\u0020\u007f\\]/.test(action.url.trim()) && ['http:', 'https:'].includes(new URL(action.url.trim(), 'https://react-maker.invalid/').protocol); } catch { /* 不正なURL */ }
              if (!safe) error('action-url', `${location}/url`, 'URLはhttp(s)か相対URLを指定してください。');
            }
          });
        });
      }
      if (element.componentId && !componentIds.has(element.componentId)) error('component', `${where}/componentId`, `共通部品 ${element.componentId} がありません。`);
      if (element.type === 'custom' && registered && !registered.includes(element.customComponentId)) error('custom-component', `${where}/customComponentId`, `登録部品 ${element.customComponentId} がありません。`);
      if (element.binding?.datasetId && !datasetIds.has(element.binding.datasetId)) error('dataset', `${where}/binding/datasetId`, `データ一覧 ${element.binding.datasetId} がありません。`);
      // データ一覧の見せ方（Issue #240）：並べ替え・表示の形の項目と、色のトークン
      if (element.listView && element.binding?.datasetId && datasetIds.has(element.binding.datasetId)) {
        const fields = new Set(datasets.find(({ id }) => id === element.binding.datasetId).fields.map(({ id }) => id));
        const view = element.listView;
        for (const id of [...(view.sortable ?? []), ...(view.sort?.fieldId ? [view.sort.fieldId] : []), ...Object.keys(view.formats ?? {})]) {
          if (!fields.has(id)) warn('list-field', `${where}/listView`, `一覧の見せ方で使う項目 ${id} が、データ一覧にありません（無視して表示します）。`);
        }
      }
      for (const key of ['headerToken', 'lineToken']) {
        const id = element.listView?.[key];
        if (!id) continue;
        usedTokens.add(id);
        if (!tokensById.has(id)) warn('token-ref', `${where}/listView/${key}`, 'トークンが見つかりません（直接の色か既定の色で表示します）。');
      }
      // 繰り返しと値の流し込み（Issue #160）
      if (element.repeat?.datasetId && !datasetIds.has(element.repeat.datasetId)) error('dataset', `${where}/repeat/datasetId`, `繰り返しのデータ一覧 ${element.repeat.datasetId} がありません。`);
      if (element.dataBind?.datasetId && !datasetIds.has(element.dataBind.datasetId)) error('dataset', `${where}/dataBind/datasetId`, `データ一覧 ${element.dataBind.datasetId} がありません。`);
      for (const [property, id] of Object.entries(element.tokenRefs ?? {})) {
        if (!id) continue;
        usedTokens.add(id);
        const token = tokensById.get(id);
        if (!token) error('token-ref', `${where}/tokenRefs/${property}`, `トークン ${id} がありません。`);
        else if (propertyKinds[property] && token.kind !== propertyKinds[property]) error('token-kind', `${where}/tokenRefs/${property}`, `${property} には ${propertyKinds[property]} のトークンを使います（${token.name} は ${token.kind}）。`);
      }
      for (const [state, settings] of Object.entries(element.states ?? {})) for (const [property, id] of Object.entries(settings?.tokenRefs ?? {})) {
        if (!id) continue;
        usedTokens.add(id); const token = tokensById.get(id); const at = `${where}/states/${state}/tokenRefs/${property}`;
        if (!token) error('token-ref', at, `トークン ${id} がありません。`);
        else if (propertyKinds[property] && token.kind !== propertyKinds[property]) error('token-kind', at, `${property} には ${propertyKinds[property]} のトークンを使います。`);
      }
      (element.animations ?? []).forEach((animation, animationIndex) => {
        if (!motionTriggers.has(animation?.trigger)) error('motion-trigger', `${where}/animations/${animationIndex}/trigger`, `きっかけ「${animation?.trigger}」は使えません（${[...motionTriggers].join('・')}）。`);
        if (animation?.durationToken) usedTokens.add(animation.durationToken);
        if (animation?.easingToken) usedTokens.add(animation.easingToken);
      });
      // 生の値：同じ値のトークンがあるなら、トークンを使う
      for (const property of ['color', 'backgroundColor', 'borderColor', 'padding', 'gap']) {
        const value = element.style?.[property];
        if (value === undefined || value === null || element.tokenRefs?.[property]) continue;
        const kind = propertyKinds[property];
        const same = tokens.find((token) => token.kind === kind && !token.ref && String(token.value).toLowerCase() === String(value).toLowerCase());
        if (same) warn('raw-value', `${where}/style/${property}`, `${property} の ${value} は、トークン「${same.name}」（${same.id}）と同じ値です。tokenRefs.${property} を使います。`);
      }
      if (owner === 'screen') {
        if (element.type === 'button' && !element.componentId && !String(element.text ?? '').trim() && !element.icon && !String(element.attributes?.['aria-label'] ?? '').trim()) warn('button-name', `${where}/text`, 'ボタンに文言がありません（読み上げで名前が無くなります）。');
        if (element.type === 'image' && element.src && !element.decorative && !String(element.alt ?? '').trim()) warn('image-alt', `${where}/alt`, '画像に代替テキストがありません。飾りなら decorative: true にします。');
      }
      if (element.children !== undefined) visit(element.children, [...at, 'children'], ids, owner);
    });
  }
  // スクロール・動きの再生の対象を探す範囲（同じ画面・同じ部品の要素）
  let screenElementIds = new Set();
  const idsIn = (list, found = new Set()) => { for (const item of Array.isArray(list) ? list : []) { if (isObject(item)) { if (typeof item.id === 'string') found.add(item.id); idsIn(item.children, found); } } return found; };
  screens.forEach((screen, index) => { screenElementIds = idsIn(screen?.elements); visit(screen?.elements, ['screens', index, 'elements'], new Set(), 'screen'); });
  components.forEach((component, index) => { screenElementIds = idsIn([component.root]); visit([component.root], ['designSystem', 'components', index, 'root'], new Set(), 'component'); });
  if (!errors.length) for (const message of stateProjectErrors({ screens, designSystem: { components }, datasets: project.datasets })) error('state-reference', '', message);

  tokens.forEach((token, index) => {
    if (!usedTokens.has(token.id)) warn('unused-token', pointer('designSystem', 'tokens', index), `トークン「${token.name}」はどこでも使われていません。`);
  });
  return { ok: errors.length === 0, errors, warnings };
}

/** 結果を人が読む文にする */
export function formatLint({ errors, warnings }) {
  const lines = [
    ...errors.map(({ path, message }) => `要修正　${path || '/'}　${message}`),
    ...warnings.map(({ path, message }) => `要確認　${path || '/'}　${message}`),
  ];
  lines.push(`要修正 ${errors.length}件・要確認 ${warnings.length}件`);
  return lines.join('\n');
}
