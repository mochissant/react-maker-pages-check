// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 道筋に沿った動き（Issue #161）。キャンバスで描いた曲線に沿って、要素を動かす。
 * - 点の座標は、要素の左上の「止まっている位置」からのずれ（px）。最初の点は (0, 0)（止まっている位置）
 * - 入ってくる動き（画面を開いたとき・見えたとき）は、最後の点から (0, 0) へ。操作の動きは (0, 0) から最後の点へ行って戻る。出るときは (0, 0) から最後の点へ
 * - CSS の offset-path（Motion Path）で動かす。offset-anchor を 0 0 にすると、座標がそのまま左上のずれになる。対応しない環境では、始点と終点の直線にする
 */
import type { MotionPath, MotionPathPoint } from './model-types.ts';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000;
const point = (value: unknown): value is { x: number; y: number } => typeof value === 'object' && value !== null && finite((value as { x?: unknown }).x) && finite((value as { y?: unknown }).y);

export function validMotionPath(value: unknown): value is MotionPath {
  if (typeof value !== 'object' || value === null) return false;
  const points = (value as { points?: unknown }).points;
  return Array.isArray(points) && points.length >= 2 && points.length <= 50
    && points.every((item: unknown) => point(item) && ((item as MotionPathPoint).in === undefined || point((item as MotionPathPoint).in)) && ((item as MotionPathPoint).out === undefined || point((item as MotionPathPoint).out)));
}

const round = (value: number) => Math.round(value * 10) / 10;

/** SVG の path の d（点の間は、制御点があれば3次ベジェ、無ければ直線） */
export function pathData(path: MotionPath) {
  const [first, ...rest] = path.points;
  let previous = first;
  const parts = [`M ${round(first.x)} ${round(first.y)}`];
  for (const current of rest) {
    if (previous.out || current.in) {
      const a = previous.out ?? previous;
      const b = current.in ?? current;
      parts.push(`C ${round(a.x)} ${round(a.y)} ${round(b.x)} ${round(b.y)} ${round(current.x)} ${round(current.y)}`);
    } else parts.push(`L ${round(current.x)} ${round(current.y)}`);
    previous = current;
  }
  return parts.join(' ');
}

/** 新しく道筋を付けるときの曲線（右下から弧を描いて止まる。画面の上や左の端の要素でも、キャンバスの中に見える向き） */
export const defaultMotionPath = (): MotionPath => ({
  points: [{ x: 0, y: 0, out: { x: 30, y: 90 } }, { x: 140, y: 80, in: { x: 150, y: 10 } }],
});

/** 道筋の動きの、動いた先の状態と止まっている状態（WAAPI のキーフレームに足す） */
export function pathFrames(path: MotionPath, supported: boolean): { moved: Keyframe; rest: Keyframe } {
  const end = path.points[path.points.length - 1];
  if (!supported) return { moved: { translate: `${round(end.x)}px ${round(end.y)}px` }, rest: { translate: '0px 0px' } };
  const shared = { offsetPath: `path("${pathData(path)}")`, offsetAnchor: '0px 0px', offsetRotate: path.rotate ? 'auto' : '0deg' };
  return { moved: { ...shared, offsetDistance: '100%' }, rest: { ...shared, offsetDistance: '0%' } };
}

export function motionPathSupported(view: { CSS?: { supports?: (property: string, value: string) => boolean } } | null | undefined = globalThis) {
  return Boolean(view?.CSS?.supports?.('offset-path', 'path("M 0 0 L 1 1")'));
}
