// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import React, { useState, type CSSProperties } from 'react';

/**
 * 画像。寸法が分かれば width・height で表示領域を先に確保する。
 * 優先する画像（最初の画面の先頭の画像など）だけ fetchpriority="high"、ほかは遅延読み込み（Issue #125）
 */
type ScreenImageProps = { src: string; alt?: string; editing?: boolean; width?: number; height?: number; priority?: boolean; style?: CSSProperties };

export function ScreenImage({ src, alt = '', editing = false, width, height, priority = false, style }: ScreenImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    if (alt) return <span>{alt}</span>;
    return editing ? <span>画像を読み込めませんでした</span> : null;
  }
  const size = typeof width === 'number' && typeof height === 'number' && Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 ? { width, height } : {};
  return <img src={src} alt={alt} {...size} style={style} decoding="async" loading={priority ? 'eager' : 'lazy'}
    {...(priority ? { fetchPriority: 'high' as const } : {})} onError={() => setFailed(true)} />;
}
