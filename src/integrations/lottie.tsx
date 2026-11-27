// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 汎用部品「Lottie」（Issue #113）。Lottie の JSON（URL）を置き、再生のきっかけを選ぶ。
 * 動きを減らす設定と、編集中は再生せず最初の1コマを出す。文言を入れると画像として読み上げ、空なら飾りとして読み上げない
 */
import { useEffect, useRef } from 'react';

type Player = { loadAnimation: (container: HTMLElement, path: string, loop: boolean) => {
  play: () => void; stop: () => void; goToAndStop: (frame: number, isFrame?: boolean) => void; destroy: () => void;
  addEventListener: (name: string, callback: () => void) => void;
} };
const players = import.meta.glob<Player>('./lottie-player.ts');
export const lottieTriggers = ['自動再生', 'ホバー', '見えたら', '押したら'] as const;

function reduced(node: HTMLElement) {
  const view = node.ownerDocument.defaultView;
  return node.ownerDocument.documentElement.dataset.reducedMotion === 'reduce' || (view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

export function LottieView({ src, trigger, loop, label, interactive }: { src: string; trigger: string; loop: boolean; label: string; interactive: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = box.current;
    const load = players['./lottie-player.ts'];
    if (!node || !load || !/^(https:\/\/|\/|\.\/)/.test(src)) return undefined;
    let cancelled = false;
    let cleanup = () => {};
    void load().then(({ loadAnimation }) => {
      if (cancelled) return;
      const animation = loadAnimation(node, src, loop);
      const still = !interactive || reduced(node);
      const play = () => { if (!still) { animation.stop(); animation.play(); } };
      const listeners: Array<[EventTarget, string, () => void]> = [];
      const on = (target: EventTarget, name: string, callback: () => void) => { target.addEventListener(name, callback); listeners.push([target, name, callback]); };
      let observer: IntersectionObserver | undefined;
      animation.addEventListener('DOMLoaded', () => {
        animation.goToAndStop(0, true);
        if (still) return;
        if (trigger === '自動再生') play();
        if (trigger === 'ホバー') { on(node, 'pointerenter', play); on(node, 'pointerleave', () => animation.stop()); }
        if (trigger === '押したら') on(node, 'click', play);
        if (trigger === '見えたら') {
          observer = new IntersectionObserver((entries) => { if (entries.some(({ isIntersecting }) => isIntersecting)) { play(); observer?.disconnect(); } }, { threshold: 0.3 });
          observer.observe(node);
        }
      });
      cleanup = () => { observer?.disconnect(); for (const [target, name, callback] of listeners) target.removeEventListener(name, callback); animation.destroy(); };
    });
    return () => { cancelled = true; cleanup(); };
  }, [src, trigger, loop, interactive]);
  const text = label.trim();
  return <div ref={box} className="rm-part-lottie" data-trigger={trigger} {...(text ? { role: 'img', 'aria-label': text } : { 'aria-hidden': true })}>
    {!src && <p className="rm-part-hint">Lottie の JSON の URL を設定してください。</p>}
  </div>;
}
