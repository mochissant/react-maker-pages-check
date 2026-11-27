// react-maker が生成した画面「注文完了」（/page-4）。Issue #106
// コードで直してよい：クラス・属性（aria-*・data-*・id・title・role・lang）・文言・要素の前のコメントは、編集GUIに戻ります（docs/code-roundtrip.md）。
// それ以外の書き方（map・条件・フックなど）を使うと、このファイルは「コードで管理」になり、ツールは書き換えません。element('<id>') の要素は、共通の描画（ScreenView）が描きます。
import type { ScreenParts } from './types';

/** 画面の内容の署名。書き出したあとに project.json を直接書き換えると合わなくなり、そのあいだは共通の描画で表示する */
export const signature = "scqhi7";

export default function Page4Page({ element }: ScreenParts) {
  return (
    <>
      <h1 className="element element-heading text-[24px] font-bold" data-element-id="76b84e1b-2399-4ae9-a068-026b166449a0">{"注文完了"}</h1>
      {element("ffdec46f-3c0d-49d8-a092-92e3ad8248c2")} {/* 注文結果 */}
      {element("a71d68d8-6870-45e5-99c8-3111392ed35d")} {/* ボタン */}
    </>
  );
}
