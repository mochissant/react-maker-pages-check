// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 汎用部品「背景」（Issue #120）：グラデーションの動き・ノイズ・粒子。中に要素を置ける（背景の上に重なる）。
 * - 性能：粒子は画面幅 640px 未満で 24 個・それ以外で 60 個まで、解像度は 1.5 倍まで。見えていない間と、タブが裏にある間は止める
 * - 動きを減らす設定では、どれも止まった絵にする
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export const backdropModes = ['グラデーションの動き', 'ノイズ', '粒子'] as const;

function reduced(node: HTMLElement) {
  const view = node.ownerDocument.defaultView;
  return node.ownerDocument.documentElement.dataset.reducedMotion === 'reduce' || (view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

function Particles({ color, interactive }: { color: string; interactive: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext('2d');
    const view = node?.ownerDocument.defaultView;
    if (!node || !context || !view) return undefined;
    const still = !interactive || reduced(node);
    const scale = Math.min(view.devicePixelRatio || 1, 1.5);
    const count = view.innerWidth < 640 ? 24 : 60;
    let width = 0;
    let height = 0;
    const dots = Array.from({ length: count }, (_, index) => ({ x: (index * 0.618) % 1, y: (index * 0.382) % 1, r: 1 + (index % 3), vx: ((index % 5) - 2) * 0.00012, vy: -0.0002 - (index % 4) * 0.00008 }));
    const resize = () => {
      width = node.clientWidth;
      height = node.clientHeight;
      node.width = Math.max(1, Math.round(width * scale));
      node.height = Math.max(1, Math.round(height * scale));
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = color;
      for (const dot of dots) {
        context.globalAlpha = 0.35 + (dot.r / 6);
        context.beginPath();
        context.arc(dot.x * width, dot.y * height, dot.r, 0, Math.PI * 2);
        context.fill();
      }
    };
    resize();
    draw();
    if (still) return undefined;
    let frame = 0;
    let visible = true;
    let last = view.performance.now();
    const step = (now: number) => {
      const delta = Math.min(64, now - last);
      last = now;
      for (const dot of dots) {
        dot.x = (dot.x + dot.vx * delta + 1) % 1;
        dot.y = (dot.y + dot.vy * delta + 1) % 1;
      }
      draw();
      frame = visible ? view.requestAnimationFrame(step) : 0;
    };
    const observer = new view.IntersectionObserver((entries) => {
      visible = entries.some(({ isIntersecting }) => isIntersecting);
      if (visible && !frame) { last = view.performance.now(); frame = view.requestAnimationFrame(step); }
    });
    observer.observe(node);
    view.addEventListener('resize', resize);
    return () => { view.cancelAnimationFrame(frame); observer.disconnect(); view.removeEventListener('resize', resize); };
  }, [color, interactive]);
  return <canvas ref={canvas} className="rm-backdrop-layer" aria-hidden="true" />;
}

export function Backdrop({ mode, color1, color2, interactive, children }: { mode: string; color1: string; color2: string; interactive: boolean; children: ReactNode }) {
  return <div className="rm-backdrop" data-mode={mode} data-still={interactive ? undefined : ''} style={{ '--rm-bg-1': color1, '--rm-bg-2': color2 } as Record<string, string>}>
    {mode === '粒子' ? <Particles color={color1} interactive={interactive} /> : <div className="rm-backdrop-layer" aria-hidden="true" />}
    <div className="rm-backdrop-content">{children}</div>
  </div>;
}
