// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
// react-maker が生成した共通部品「共通フッター」（Issue #107）。編集GUIで部品を直して保存すると、作り直されます。
// 書き出したサイトの画面は、この部品を variant と props で使います。
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

const rootClass = cva('element element-container', {
  variants: { variant: {
    "base": "flex flex-col gap-space-s pt-space-xl pb-space-xl pl-space-ml pr-space-ml rounded-none text-muted",
  } },
  defaultVariants: { variant: 'base' },
});

const containerClass = cva('element element-container', {
  variants: { variant: {
    "base": "flex flex-row gap-space-s flex-wrap items-center w-full max-w-270 ml-auto mr-auto justify-between shrink-0",
  } },
  defaultVariants: { variant: 'base' },
});

const text2Class = cva('element element-text', {
  variants: { variant: {
    "base": "m-0 text-text-0-875 text-muted",
  } },
  defaultVariants: { variant: 'base' },
});

const container2Class = cva('element element-container', {
  variants: { variant: {
    "base": "flex flex-row gap-space-m flex-wrap items-center",
  } },
  defaultVariants: { variant: 'base' },
});

const text3Class = cva('element element-text', {
  variants: { variant: {
    "base": "m-0 text-text-0-875 text-muted",
  } },
  defaultVariants: { variant: 'base' },
});

const text4Class = cva('element element-text', {
  variants: { variant: {
    "base": "m-0 text-text-0-875 text-muted",
  } },
  defaultVariants: { variant: 'base' },
});

const defaults = {
  "base": { text2Text: "© サービス名", text3Text: "利用規約", text4Text: "プライバシー" },
};

export type Component3Variant = "base";

export type Component3Props = {
  /** バリアント（編集GUIのバリアント。base が基本） */
  variant?: Component3Variant;
  /** text2 の文言 */
  text2Text?: string;
  /** text3 の文言 */
  text3Text?: string;
  /** text4 の文言 */
  text4Text?: string;
  /** 部品の中に差し込む要素 */
  children?: ReactNode;
  className?: string;
  /** 画面の配置の id（data-element-id。中の要素は「配置の id/要素の id」） */
  elementId?: string;
};

export default function Component3(props: Component3Props) {
  const variant = props.variant ?? 'base';
  return (
    <div className={rootClass({ variant, className: props.className })} data-component="Component3" data-element-id={props.elementId}>
      <div className={containerClass({ variant })} data-element-id={props.elementId ? props.elementId + "/d6c72088-23fb-4c8a-912b-c2c1b4c77c2c" : undefined}>
        <p className={text2Class({ variant })} data-element-id={props.elementId ? props.elementId + "/778888ee-f63c-4b72-bd27-42e3bd640bbf" : undefined}>{props.text2Text ?? defaults[variant].text2Text}</p>
        <div className={container2Class({ variant })} data-element-id={props.elementId ? props.elementId + "/ca961462-9e86-4f09-bd8f-266dd0b4e752" : undefined}>
          <p className={text3Class({ variant })} data-element-id={props.elementId ? props.elementId + "/ff7b6c89-ba18-4582-8719-5522e242e874" : undefined}>{props.text3Text ?? defaults[variant].text3Text}</p>
          <p className={text4Class({ variant })} data-element-id={props.elementId ? props.elementId + "/a3bec291-691c-400d-8cf9-22baa02cc259" : undefined}>{props.text4Text ?? defaults[variant].text4Text}</p>
        </div>
      </div>
      {props.children}
    </div>
  );
}
