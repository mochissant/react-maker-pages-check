// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * 重ねて出す・入力の汎用部品（Issue #154）。土台は Radix（radix-ui。MIT）。キーボード操作・フォーカス・読み上げは Radix が受け持つ。
 * 見た目は src/preview.css の .rm-part-*。文字色（currentColor）を受け継ぎ、強調の色は案件のトークン（要素設定の文字色など）に従う
 * 重ねて出す中身は Portal を使わずその場に置く（位置は fixed で決まる）。編集GUIのプレビュー（iframe）でも同じ文書の中に出る
 * 開くときの動きは「ぽよん」に近い拡大と不透明度（CSS）。動きを減らす設定では動かさない
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { DropdownMenu, Popover, Slider, Tooltip } from 'radix-ui';

/** 編集中（interactive でない）は開かない。見本の位置に置くだけ */
type Common = { interactive: boolean; children?: ReactNode };

export function TooltipPart({ label, text, interactive }: Common & { label: string; text: string }) {
  return <Tooltip.Provider delayDuration={300}>
    <Tooltip.Root open={interactive ? undefined : false}>
      <Tooltip.Trigger asChild><button type="button" className="rm-part-trigger">{label.trim() || '？'}</button></Tooltip.Trigger>
      <Tooltip.Content className="rm-part-floating rm-part-tooltip" sideOffset={6}>{text}<Tooltip.Arrow className="rm-part-arrow" /></Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>;
}

export function PopoverPart({ label, title, text, interactive, children }: Common & { label: string; title: string; text: string }) {
  return <Popover.Root open={interactive ? undefined : false}>
    <Popover.Trigger asChild><button type="button" className="rm-part-trigger">{label.trim() || '開く'}</button></Popover.Trigger>
    <Popover.Content className="rm-part-floating rm-part-popover" sideOffset={8} aria-label={title.trim() || undefined}>
      {title.trim() && <p className="rm-part-popover-title">{title}</p>}
      {text.trim() && <p className="rm-part-popover-text">{text}</p>}
      {children}
      <Popover.Close className="rm-part-close" aria-label="閉じる">×</Popover.Close>
    </Popover.Content>
  </Popover.Root>;
}

export function MenuPart({ label, items, interactive, onSelect }: Common & { label: string; items: string[]; onSelect?: (item: string) => void }) {
  // 入れ物の外へ出さない（Portal なし）ので、modal にすると、押したボタン自身まで aria-hidden になる（Issue #270）。外の操作は閉じる動きで扱う
  return <DropdownMenu.Root open={interactive ? undefined : false} modal={false}>
    <DropdownMenu.Trigger asChild><button type="button" className="rm-part-trigger" aria-haspopup="menu">{label.trim() || 'メニュー'}<span aria-hidden="true"> ▾</span></button></DropdownMenu.Trigger>
    <DropdownMenu.Content className="rm-part-floating rm-part-menu" sideOffset={6} align="start">
      {items.map((item) => <DropdownMenu.Item key={item} className="rm-part-menu-item" onSelect={() => onSelect?.(item)}>{item}</DropdownMenu.Item>)}
    </DropdownMenu.Content>
  </DropdownMenu.Root>;
}

export function SliderPart({ label, min, max, step, initial, unit }: { label: string; min: number; max: number; step: number; initial: number; unit: string }) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const clamp = (value: number) => Math.min(high, Math.max(low, value));
  const [value, setValue] = useState(() => clamp(initial));
  return <div className="rm-part-slider">
    <span className="rm-part-slider-label"><span>{label}</span><output>{value}{unit}</output></span>
    <Slider.Root className="rm-part-slider-root" min={low} max={high} step={step > 0 ? step : 1} value={[clamp(value)]} onValueChange={([next]) => setValue(next ?? low)}>
      <Slider.Track className="rm-part-slider-track"><Slider.Range className="rm-part-slider-range" /></Slider.Track>
      <Slider.Thumb className="rm-part-slider-thumb" aria-label={label || '値'} />
    </Slider.Root>
  </div>;
}
