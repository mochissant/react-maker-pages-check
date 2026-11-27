// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 動画の背景（Issue #248）。コンテナの後ろに、音の無い動画をくり返し流す。
 * - 止める・流すのボタンを必ず出す（5秒を超えて自動で動くものは止められるようにする。WCAG 2.2.2）
 * - 動きを減らす設定では、自動で流さずポスターを見せる（ボタンで流せる）
 * - ポスター：読み込むまでと、読み込めなかったときに見せる。読み込めなければ動画を隠す
 * - 文字を読みやすくする暗幕（0〜80%）。動画は飾りなので、読み上げない
 * 編集中は流さない（ポスターか最初のこま）
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BackgroundVideoSettings } from './model-types.ts';

const urlPattern = /^(https?:\/\/|\/|\.\/|blob:|data:video\/)/;
export const validBackgroundVideo = (value: BackgroundVideoSettings | null | undefined): value is BackgroundVideoSettings =>
  Boolean(value && typeof value.src === 'string' && urlPattern.test(value.src));

export function BackgroundVideo({ settings, editing }: { settings: BackgroundVideoSettings; editing: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const poster = typeof settings.poster === 'string' && urlPattern.test(settings.poster) ? settings.poster : undefined;
  const overlay = typeof settings.overlay === 'number' && Number.isFinite(settings.overlay) ? Math.min(80, Math.max(0, settings.overlay)) : 40;
  useEffect(() => {
    const node = video.current;
    if (!node || editing || failed) return undefined;
    const reduced = node.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) { node.pause(); setPlaying(false); return undefined; }
    void node.play().then(() => setPlaying(true), () => setPlaying(false));
    return undefined;
  }, [editing, failed, settings.src]);
  const toggle = () => {
    const node = video.current;
    if (!node) return;
    if (node.paused) void node.play().then(() => setPlaying(true), () => setPlaying(false));
    else { node.pause(); setPlaying(false); }
  };
  return <>
    <div className="rm-video-background" aria-hidden="true">
      {failed ? poster && <img src={poster} alt="" className="rm-video-media" decoding="async" />
        : <video ref={video} className="rm-video-media" src={settings.src} poster={poster} muted loop playsInline preload={editing ? 'metadata' : 'auto'}
          onError={() => setFailed(true)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />}
      {overlay > 0 && <span className="rm-video-overlay" style={{ opacity: overlay / 100 }} />}
    </div>
    {!editing && !failed && <button type="button" className="rm-video-toggle" aria-pressed={!playing} onClick={toggle}>{playing ? '動画を止める' : '動画を流す'}</button>}
  </>;
}
