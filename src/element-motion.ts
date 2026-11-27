// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 任意の要素の動き（Issue #102）。共通の描画（ScreenView）から使い、プレビューと書き出しで同じ動きにする。
 * element.animations = [{ id, trigger, effect: { opacity, x, y, scale, rotate, blur }, duration, delay, easing, iterations }]
 * - 入ってくる動き（appear：画面を開いた、inView：スクロールで見えた）は、effect の状態から元の状態へ
 * - 操作の動き（hover・press・focus）は、元の状態から effect の状態へ。操作が終わると戻る
 * - 動きを減らす設定では、移動・拡大・回転・ぼかしを外し、不透明度の変化だけにする（なければ動かさない）
 */
import { springEasing } from './spring.ts';
import type { DesignToken, ElementAnimation, ElementData, MotionEffect } from './model-types.ts';
import { motionPathSupported, pathFrames, validMotionPath } from './motion-path.ts';
import { timelineSchedule } from './motion-timeline.ts';

type Motion = { frames: Keyframe[]; options: KeyframeAnimationOptions & { duration: number; delay: number } };
type MotionTokens = ReadonlyArray<Pick<DesignToken, 'id' | 'kind' | 'value'>>;
/** スクロール駆動アニメーション（Baseline では Newly available でないので、DOM の型に無い環境もある） */
type TimelineWindow = Window & {
  /** プレビューの iframe の中の要素は、その iframe の IntersectionObserver で見る */
  IntersectionObserver: typeof IntersectionObserver;
  ScrollTimeline?: new (options: { source: Element }) => AnimationTimeline;
  ViewTimeline?: new (options: { subject: Element }) => AnimationTimeline;
};

/** 動きを減らすか：OSの設定か、プレビューの「動きを減らす」（html[data-reduced-motion="reduce"]）。Issue #105 */
export function prefersReducedMotion(document: Document | null | undefined) {
  if (!document) return false;
  if (document.documentElement?.dataset.reducedMotion === 'reduce') return true;
  return document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** 動きのトークン（時間・曲線）を解決する。見つからなければ fallback */
function tokenValue<Fallback extends string | number>(tokens: MotionTokens | undefined, id: string | undefined, kind: string, fallback: Fallback): Fallback {
  const token = id && tokens?.find((item) => item.id === id && item.kind === kind);
  return token && (typeof token.value === typeof fallback) ? token.value as Fallback : fallback;
}

export const motionTriggers: Array<[string, string]> = [
  ['appear', '画面を開いたとき'], ['inView', 'スクロールで見えたとき'], ['exit', '画面から出るとき'], ['hover', 'ホバー'], ['press', '押したとき'], ['focus', 'フォーカス'],
  ['loaded', 'データの読み込みが終わったとき'], ['added', '一覧に追加されたとき'], ['error', 'エラーになったとき'],
  ['scroll', 'スクロールに連動'], ['action', '操作から再生'], ['tilt', 'マウスに合わせて傾ける（3D）'],
];

/**
 * マウスの位置に合わせて傾ける（チルト。Issue #271）。effect の rotateX・rotateY を、傾ける最大の角度にする（無ければ 10 度）。
 * 要素の上のマウスの位置（中心からのずれ）で傾き、離すと戻る。動きは少しずつ追いかける（急に跳ねない）。
 * もとの変形（回転・移動など）に足す（composite: add）。動きを減らす設定では、呼ぶ側で付けない
 */
function tiltFollow(node: Element, animation: ElementAnimation, view: Window) {
  const maxX = isNumber(animation.effect?.rotateX) ? animation.effect.rotateX : 10;
  const maxY = isNumber(animation.effect?.rotateY) ? animation.effect.rotateY : 10;
  const current = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let running: Animation | null = null;
  let frame = 0;
  const keyframes = () => [{ transform: `perspective(800px) rotateX(${current.x.toFixed(2)}deg) rotateY(${current.y.toFixed(2)}deg)` }];
  function step() {
    current.x += (target.x - current.x) * 0.2;
    current.y += (target.y - current.y) * 0.2;
    const settled = Math.abs(target.x - current.x) < 0.05 && Math.abs(target.y - current.y) < 0.05;
    if (settled) { current.x = target.x; current.y = target.y; }
    if (!running) running = node.animate(keyframes(), { duration: 1, fill: 'forwards', composite: 'add' });
    else (running.effect as KeyframeEffect | null)?.setKeyframes(keyframes());
    if (settled && target.x === 0 && target.y === 0) { running.cancel(); running = null; frame = 0; return; }
    frame = settled ? 0 : view.requestAnimationFrame(step);
  }
  const queue = () => { if (!frame) frame = view.requestAnimationFrame(step); };
  const move = (event: Event) => {
    const { clientX, clientY } = event as PointerEvent;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    const py = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
    target.x = -py * maxX;
    target.y = px * maxY;
    queue();
  };
  const leave = () => { target.x = 0; target.y = 0; queue(); };
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerleave', leave);
  return () => {
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerleave', leave);
    if (frame) view.cancelAnimationFrame(frame);
    running?.cancel();
  };
}

/**
 * 文字を分けて動かす（Issue #120）。mode：char（1文字ずつ）・word（単語ごと。日本語は Intl.Segmenter の語）・line（改行ごと）。
 * 読み上げでは分けない（描画側で、分けた文字は aria-hidden、全文は visually-hidden に置く）
 */
export function splitText(text: unknown, mode: string) {
  const value = String(text ?? '');
  if (mode === 'line') return value.split('\n');
  if (mode === 'word') {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(value)].map(({ segment }) => segment);
    return value.split(/(\s+)/).filter(Boolean);
  }
  return [...value];
}

/** 数字を数え上げる（Issue #120）。「1,200社」の 1,200 を 0 から数える。桁区切りと小数の桁はそろえる */
export function countFrames(text: unknown, progress: number) {
  return String(text).replace(/\d[\d,]*(\.\d+)?/g, (match) => {
    const target = Number(match.replace(/,/g, ''));
    const decimals = match.includes('.') ? match.split('.')[1].length : 0;
    const value = target * progress;
    const fixed = value.toFixed(decimals);
    return match.includes(',') ? Number(fixed).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : fixed;
  });
}

/** 状態の変化のきっかけ（Issue #133）。画面の要素に rm:state イベント（detail.kind）で知らせる */
export const stateTriggers = new Set(['loaded', 'added', 'error']);

export const motionEasings: Array<[string, string, number[]]> = [
  ['ease-out', '減速（ease-out）', [0, 0, 0.2, 1]], ['ease-in-out', '加速して減速', [0.4, 0, 0.2, 1]],
  ['emphasized', '強調', [0.2, 0, 0, 1]], ['overshoot', '行き過ぎて戻る', [0.34, 1.56, 0.64, 1]], ['linear', '一定', [0, 0, 1, 1]],
];


const entering = new Set(['appear', 'inView', 'loaded']);

/**
 * 画面から出るときの動き（Issue #133）。effect の状態へ動かし、終わるのを待つ（最大 1.2 秒）。
 * 動きを減らす設定では、不透明度だけにするか、動かさない
 */
export async function playExit(root: Element | null | undefined, elements: ElementData[], tokens?: MotionTokens) {
  if (!root) return;
  const reduced = prefersReducedMotion(root.ownerDocument);
  const runs: Array<Promise<unknown>> = [];
  (function visit(list: ElementData[]) {
    for (const element of list) {
      for (const animation of element.animations ?? []) {
        if (animation.trigger !== 'exit') continue;
        const node = root.querySelector(`[data-element-id="${CSS.escape(element.id)}"]`);
        const motion = node && motionKeyframes({ ...animation, trigger: 'hover' }, reduced, tokens);
        if (motion && typeof node.animate === 'function') runs.push(node.animate(motion.frames, { ...motion.options, fill: 'forwards' }).finished.catch(() => {}));
      }
      if (element.children) visit(element.children);
    }
  })(elements);
  if (runs.length) await Promise.race([Promise.all(runs), new Promise((resolve) => setTimeout(resolve, 1200))]);
}

/** 自分で決めた曲線（Issue #251）：cubic-bezier(x1, y1, x2, y2)。x は 0〜1。読めなければ null */
export function customEasing(name: unknown): number[] | null {
  const match = typeof name === 'string' ? /^cubic-bezier\(([^)]*)\)$/.exec(name.trim()) : null;
  const values = match ? match[1].split(',').map((part) => Number(part.trim())) : [];
  return values.length === 4 && values.every(Number.isFinite) && values[0] >= 0 && values[0] <= 1 && values[2] >= 0 && values[2] <= 1 ? values : null;
}

function easingOf(name: string | undefined) {
  const bezier = customEasing(name) ?? motionEasings.find(([id]) => id === name)?.[2] ?? motionEasings[0][2];
  return `cubic-bezier(${bezier.join(',')})`;
}

/** effect を keyframe の1つにする。reduced なら不透明度だけ */
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function effectFrame(effect: MotionEffect = {}, reduced = false) {
  const frame: Keyframe = {};
  if (isNumber(effect.opacity)) frame.opacity = effect.opacity;
  if (reduced) return frame;
  const transforms: string[] = [];
  // 3D（Issue #233）：遠近を付けて、親に遠近が無くても立体に見えるようにする
  const solid = isNumber(effect.rotateX) || isNumber(effect.rotateY) || isNumber(effect.z);
  if (solid) transforms.push('perspective(800px)');
  if (isNumber(effect.x) || isNumber(effect.y)) transforms.push(`translate(${effect.x ?? 0}px, ${effect.y ?? 0}px)`);
  if (isNumber(effect.z)) transforms.push(`translateZ(${effect.z}px)`);
  if (isNumber(effect.scale)) transforms.push(`scale(${effect.scale / 100})`);
  if (isNumber(effect.rotateX)) transforms.push(`rotateX(${effect.rotateX}deg)`);
  if (isNumber(effect.rotateY)) transforms.push(`rotateY(${effect.rotateY}deg)`);
  if (isNumber(effect.rotate)) transforms.push(`rotate(${effect.rotate}deg)`);
  if (transforms.length) frame.transform = transforms.join(' ');
  if (isNumber(effect.blur) && effect.blur > 0) frame.filter = `blur(${effect.blur}px)`;
  return frame;
}

function restFrame(frame: object) {
  const rest: Keyframe = {};
  if ('opacity' in frame) rest.opacity = 1;
  if ('transform' in frame) rest.transform = 'none';
  if ('filter' in frame) rest.filter = 'none';
  return rest;
}

/** 強さ（strength・%）で、動きの大きさを変える（拡大率は 100 からの差を変える） */
function scaled(effect: MotionEffect = {}, strength = 100) {
  const ratio = strength / 100;
  const result = { ...effect };
  for (const key of ['x', 'y', 'rotate', 'blur', 'rotateX', 'rotateY', 'z'] as const) {
    const value = result[key];
    if (isNumber(value)) result[key] = value * ratio;
  }
  if (isNumber(result.scale)) result.scale = 100 + (result.scale - 100) * ratio;
  if (isNumber(result.opacity)) result.opacity = 1 - (1 - result.opacity) * Math.min(1, ratio);
  return result;
}

/** 1つの動きの keyframes と options。動かすものがなければ null */
export function motionKeyframes(animation: ElementAnimation, reduced = false, tokens: MotionTokens = []): Motion | null {
  // プリセットの代替が「動かさない」なら、動きを減らす設定では何もしない（Issue #104）
  if (reduced && animation.reducedFallback === 'none') return null;
  const strength = isNumber(animation.strength) ? animation.strength : 100;
  const speed = isNumber(animation.speed) && animation.speed > 0 ? animation.speed : 100;
  // 視差（Issue #185）：動く量は要素と画面の高さで決まる（scrollLinked で作る）。動きを減らす設定では止める
  if (animation.trigger === 'scroll' && isNumber(animation.parallax) && animation.parallax !== 0) {
    if (reduced) return null;
    return { frames: [{ transform: 'none' }, { transform: 'none' }], options: { duration: 1000, delay: 0, easing: 'linear', fill: 'both' } };
  }
  // 途中の形を持つ動き（ぶるっ・ドン など）：frames の各状態を順にたどり、最後は元の状態
  if (Array.isArray(animation.frames) && animation.frames.length) {
    const frames = animation.frames.map((effect) => effectFrame(scaled(effect, strength), reduced));
    if (!frames.some((frame) => Object.keys(frame).length)) return null;
    const keys = new Set(frames.flatMap((frame) => Object.keys(frame)));
    const rest = restFrame(Object.fromEntries([...keys].map((key) => [key, true])));
    const filled = frames.map((frame) => ({ ...rest, ...frame }));
    const duration = (isNumber(animation.duration) ? animation.duration : 500) * 100 / speed;
    return { frames: [...filled, rest], options: { duration, delay: isNumber(animation.delay) ? animation.delay : 0,
      easing: easingOf(animation.easing), iterations: 1, direction: 'normal', fill: 'backwards' } };
  }
  const effect = effectFrame(scaled(animation.effect, strength), reduced);
  // 道筋に沿った動き（Issue #161）：動きを減らす設定では道筋をたどらない（不透明度などの効果だけ）
  const along = validMotionPath(animation.path) && !reduced ? pathFrames(animation.path, motionPathSupported()) : null;
  const frame = along ? { ...effect, ...along.moved } : effect;
  if (!Object.keys(frame).length) return null;
  const rest = along ? { ...restFrame(effect), ...along.rest } : restFrame(frame);
  // スプリング（Issue #103）：曲線と時間はスプリングから決まる
  const spring = !reduced && animation.spring && springEasing({ ...animation.spring, stiffness: animation.spring.stiffness * (speed / 100) ** 2 });
  const iterations = animation.iterations === 'infinite' ? Infinity : isNumber(animation.iterations) && Number.isInteger(animation.iterations) && animation.iterations > 0 ? animation.iterations : 1;
  return {
    frames: entering.has(animation.trigger) ? [frame, rest] : [rest, frame],
    options: {
      duration: spring ? spring.duration : tokenValue(tokens, animation.durationToken, 'duration', isNumber(animation.duration) ? animation.duration : 300) * 100 / speed,
      delay: isNumber(animation.delay) ? animation.delay : 0,
      easing: spring ? spring.easing : tokenValue(tokens, animation.easingToken, 'easing', easingOf(animation.easing)), iterations: entering.has(animation.trigger) ? iterations : 1,
      direction: iterations > 1 ? 'alternate' : 'normal', fill: entering.has(animation.trigger) ? 'backwards' : 'forwards',
    },
  };
}

/** 試し再生：きっかけに関係なく1回再生する（操作の動きは行って戻る） */
export function playOnce(node: Element | null | undefined, animation: ElementAnimation, reduced: boolean, tokens?: MotionTokens) {
  // 視差はスクロールに合わせて動くので、試し再生はしない（Issue #185）
  if (animation.trigger === 'scroll' && isNumber(animation.parallax) && animation.parallax !== 0) return null;
  const motion = node && motionKeyframes(animation, reduced, tokens);
  if (!motion || typeof node.animate !== 'function') return null;
  const frames = entering.has(animation.trigger) ? motion.frames : [...motion.frames, motion.frames[0]];
  return node.animate(frames, { ...motion.options, fill: 'none', iterations: 1, direction: 'normal' });
}

/**
 * 画面の要素に動きを付ける。返り値は後始末の関数。editing（編集モード）では何もしない（試し再生だけ）
 * elements は materializeElements の結果（子を含む）。root は画面の要素（[data-element-id] を探す）
 */
function staggerTargets(node: Element, element: ElementData, stagger: NonNullable<ElementAnimation['stagger']>): Array<[Element, number]> {
  const pieces = [...node.querySelectorAll(':scope [data-split-piece]')];
  const items = pieces.length ? pieces : element.type === 'data-list' ? [...node.querySelectorAll(':scope ul > li, :scope tbody > tr')] : [...node.children];
  const interval = isNumber(stagger.interval) ? stagger.interval : 80;
  const ordered = stagger.reverse ? [...items].reverse() : items;
  return ordered.length ? ordered.map((item, index) => [item, index * interval]) : [[node, 0]];
}

/**
 * スクロールに連動する動き（Issue #120）。CSS のスクロール駆動アニメーション（ViewTimeline・ScrollTimeline）が使える環境ではそれを使い、
 * 使えない環境では、スクロールのたびに（requestAnimationFrame で間引いて）進み具合を currentTime に入れる。
 * scroll.source：element（要素が画面を通り過ぎる間）・page（ページ全体の読み進み）。scroll.range：進み具合の範囲（%）
 */
function scrollLinked(node: Element, animation: ElementAnimation, motion: Motion, view: TimelineWindow) {
  const [start, end] = Array.isArray(animation.scroll?.range) ? animation.scroll.range : [0, 100];
  const page = animation.scroll?.source === 'page';
  let frames = motion.frames;
  // 視差：要素が画面を通り過ぎる間（画面の高さ＋要素の高さ）の、速さの割合だけ縦に動かす
  if (isNumber(animation.parallax) && animation.parallax !== 0) {
    const distance = (page ? Math.max(0, node.ownerDocument.documentElement.scrollHeight - view.innerHeight) : view.innerHeight + node.getBoundingClientRect().height) * animation.parallax / 100;
    frames = [{ transform: `translateY(${Math.round(distance / 2)}px)` }, { transform: `translateY(${Math.round(-distance / 2)}px)` }];
  }
  const Timeline = page ? view.ScrollTimeline : view.ViewTimeline;
  if (Timeline) {
    const timeline = page && view.ScrollTimeline ? new view.ScrollTimeline({ source: node.ownerDocument.documentElement }) : view.ViewTimeline ? new view.ViewTimeline({ subject: node }) : null;
    // rangeStart・rangeEnd は ViewTimeline と同じ時期に入った指定（DOM の型には無い）
    const options: KeyframeAnimationOptions & { rangeStart?: string; rangeEnd?: string } = { timeline, easing: 'linear', fill: 'both', ...(page ? {} : { rangeStart: `cover ${start}%`, rangeEnd: `cover ${end}%` }) };
    const running = node.animate(frames, options);
    return () => running.cancel();
  }
  const running = node.animate(frames, { duration: 1000, easing: 'linear', fill: 'both' });
  running.pause();
  let queued = false;
  const update = () => {
    queued = false;
    let progress: number;
    if (page) {
      const root = node.ownerDocument.documentElement;
      progress = root.scrollTop / Math.max(1, root.scrollHeight - view.innerHeight) * 100;
    } else {
      const rect = node.getBoundingClientRect();
      progress = (view.innerHeight - rect.top) / (view.innerHeight + rect.height) * 100;
    }
    const local = Math.min(1, Math.max(0, (progress - start) / Math.max(1, end - start)));
    running.currentTime = local * 1000;
  };
  const queue = () => { if (!queued) { queued = true; view.requestAnimationFrame(update); } };
  update();
  view.addEventListener('scroll', queue, { passive: true });
  view.addEventListener('resize', queue);
  return () => { view.removeEventListener('scroll', queue); view.removeEventListener('resize', queue); running.cancel(); };
}

/** 数字の数え上げ（Issue #120）：見えたら 0 から数える。動きを減らす設定では数えない */
function countUp(root: Element, elements: ElementData[], view: TimelineWindow, reduced: boolean) {
  const cleanups: Array<() => void> = [];
  for (const element of elements) {
    const target = root.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(element.id)}"] [data-count-text]`);
    if (!target) continue;
    const text = target.dataset.countText ?? '';
    if (reduced) { target.textContent = text; continue; }
    target.textContent = countFrames(text, 0);
    let frame = 0;
    const observer = new view.IntersectionObserver((entries) => {
      if (!entries.some(({ isIntersecting }) => isIntersecting)) return;
      observer.disconnect();
      const begin = view.performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - begin) / 1200);
        target.textContent = countFrames(text, 1 - (1 - t) ** 3);
        if (t < 1) frame = view.requestAnimationFrame(step);
      };
      frame = view.requestAnimationFrame(step);
    }, { threshold: 0.4 });
    observer.observe(target);
    cleanups.push(() => { observer.disconnect(); view.cancelAnimationFrame(frame); target.textContent = text; });
  }
  return () => { for (const cleanup of cleanups) cleanup(); };
}

export function attachMotions(root: Element | null | undefined, elements: ElementData[], { editing = false, tokens = [] }: { editing?: boolean; tokens?: MotionTokens } = {}) {
  const view = root?.ownerDocument.defaultView as TimelineWindow | null | undefined;
  if (!root || !view || editing) return () => {};
  const reduced = prefersReducedMotion(root.ownerDocument);
  const cleanups: Array<() => void> = [];
  const nodes: ElementData[] = [];
  const counted: ElementData[] = [];
  (function visit(list: ElementData[]) {
    for (const element of list) {
      if (element.animations?.length) nodes.push(element);
      if (element.countUp) counted.push(element);
      if (element.children) visit(element.children);
    }
  })(elements);
  cleanups.push(countUp(root, counted, view, reduced));
  // タイムライン（Issue #208）：「前の動きのあとに」の動きは、参照をたどった開始時刻を遅延にする
  const schedule = new Map(timelineSchedule(elements, (animation) => motionKeyframes(animation, reduced, tokens)?.options.duration as number | undefined)
    .filter(({ animation }) => animation.after?.id).map(({ animation, start }) => [animation.id, start]));
  for (const element of nodes) {
    const node = root.querySelector(`[data-element-id="${CSS.escape(element.id)}"]`);
    if (!node || typeof node.animate !== 'function') continue;
    for (let animation of element.animations ?? []) {
      const scheduled = animation.id ? schedule.get(animation.id) : undefined;
      if (scheduled !== undefined) animation = { ...animation, delay: scheduled };
      const motion = motionKeyframes(animation, reduced, tokens);
      if (!motion) continue;
      // スタッガー（Issue #103）：入ってくる動きを、子（データ一覧では各項目）に間隔をずらして付ける
      const staggered = (animation.stagger || animation.split) && entering.has(animation.trigger)
        && (element.children?.length || element.type === 'data-list' || animation.split);
      if (animation.split && !animation.stagger) animation = { ...animation, stagger: { interval: animation.split === 'char' ? 40 : animation.split === 'word' ? 80 : 160 } };
      const targets: Array<[Element, number]> = staggered && animation.stagger ? staggerTargets(node, element, animation.stagger) : [[node, 0]];
      if (animation.trigger === 'appear') {
        for (const [target, offset] of targets) {
          const running = target.animate(motion.frames, { ...motion.options, delay: motion.options.delay + offset });
          cleanups.push(() => running.cancel());
        }
      } else if (animation.trigger === 'action') {
        // 操作の動作「動きを再生」（Issue #161）：知らせを受けたら1回再生する（行って戻る）
        const play = () => { node.animate([...motion.frames, motion.frames[0]], { ...motion.options, fill: 'none', iterations: 1, direction: 'normal' }); };
        node.addEventListener('rm:play', play);
        cleanups.push(() => node.removeEventListener('rm:play', play));
      } else if (stateTriggers.has(animation.trigger)) {
        // 状態の変化：知らせを受けたら1回再生する（操作の動きと同じく行って戻る。読み込み完了は入ってくる動き）
        const trigger = animation.trigger;
        const play = (event: Event) => {
          if ((event as CustomEvent<{ kind?: string }>).detail?.kind !== trigger) return;
          const frames = trigger === 'loaded' ? motion.frames : [...motion.frames, motion.frames[0]];
          node.animate(frames, { ...motion.options, fill: 'none', iterations: 1, direction: 'normal' });
        };
        root.addEventListener('rm:state', play);
        cleanups.push(() => root.removeEventListener('rm:state', play));
      } else if (animation.trigger === 'scroll') {
        cleanups.push(scrollLinked(node, animation, motion, view));
      } else if (animation.trigger === 'tilt') {
        // マウスに合わせて傾ける（Issue #271）。動きを減らす設定では傾けない
        if (!reduced) cleanups.push(tiltFollow(node, animation, view));
      } else if (animation.trigger === 'exit') {
        // 画面から出るときは、遷移の前に playExit で再生する
      } else if (animation.trigger === 'inView') {
        // 見えるまでは、動きの始めの状態で待つ
        const animations = targets.map(([target, offset]) => {
          const running = target.animate(motion.frames, { ...motion.options, delay: motion.options.delay + offset });
          running.pause();
          return running;
        });
        const observer = new view.IntersectionObserver((entries) => {
          if (!entries.some(({ isIntersecting }) => isIntersecting)) return;
          for (const running of animations) running.play();
          observer.disconnect();
        }, { threshold: 0.15 });
        observer.observe(node);
        cleanups.push(() => { observer.disconnect(); for (const running of animations) running.cancel(); });
      } else {
        const events: Record<string, [string, string] | undefined> = { hover: ['pointerenter', 'pointerleave'], press: ['pointerdown', 'pointerup'], focus: ['focusin', 'focusout'] };
        const [start, end] = events[animation.trigger] ?? [];
        if (!start || !end) continue;
        const spring = Boolean(animation.spring);
        let running: Animation | null = null;
        const forward = () => { running?.cancel(); running = node.animate(motion.frames, motion.options); };
        const backward = () => {
          if (!running) return;
          // スプリングの動きは、離したときに元へ弾んで戻る（逆再生だと行き過ぎが始めに来るため）
          if (spring && !reduced) {
            running.cancel();
            running = node.animate([...motion.frames].reverse(), { ...motion.options, fill: 'none' });
            running = null;
            return;
          }
          running.reverse();
          running = null;
        };
        node.addEventListener(start, forward);
        node.addEventListener(end, backward);
        if (animation.trigger === 'press') node.addEventListener('pointerleave', backward);
        cleanups.push(() => {
          node.removeEventListener(start, forward);
          node.removeEventListener(end, backward);
          node.removeEventListener('pointerleave', backward);
          running?.cancel();
        });
      }
    }
  }
  return () => { for (const cleanup of cleanups) cleanup(); };
}

/** タイムラインの試し再生（Issue #208）：画面を開いたときの動きを、並べた開始時刻で1回ずつ再生する（編集中でも動かす） */
export function playTimeline(root: Element | null | undefined, elements: ElementData[], tokens?: MotionTokens) {
  if (!root) return [];
  const reduced = prefersReducedMotion(root.ownerDocument);
  return timelineSchedule(elements, (animation) => motionKeyframes(animation, reduced, tokens)?.options.duration as number | undefined).flatMap(({ elementId, animation, start }) => {
    const node = root.querySelector(`[data-element-id="${CSS.escape(elementId)}"]`);
    const motion = node && motionKeyframes({ ...animation, delay: start }, reduced, tokens);
    if (!motion || typeof node.animate !== 'function') return [];
    return [node.animate(motion.frames, { ...motion.options, fill: 'backwards', iterations: 1 })];
  });
}
