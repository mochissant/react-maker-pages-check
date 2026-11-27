// react-maker が生成した画面「注文確認」（/page-3）。Issue #106
// コードで直してよい：クラス・属性（aria-*・data-*・id・title・role・lang）・文言・要素の前のコメントは、編集GUIに戻ります（docs/code-roundtrip.md）。
// それ以外の書き方（map・条件・フックなど）を使うと、このファイルは「コードで管理」になり、ツールは書き換えません。element('<id>') の要素は、共通の描画（ScreenView）が描きます。
import type { ScreenParts } from './types';

/** 画面の内容の署名。書き出したあとに project.json を直接書き換えると合わなくなり、そのあいだは共通の描画で表示する */
export const signature = "1tzkhqi";

export default function Page3Page({ element }: ScreenParts) {
  return (
    <>
      <h1 className="element element-heading text-[24px] font-bold" data-element-id="e98e8654-8c65-440b-804a-1a41e472dbf0">{"注文確認"}</h1>
      {element("51b2eacc-8ed7-4932-a75c-424f90448f8e")} {/* 注文確認 */}
      {element("263b52f9-9d87-448f-86c4-3049414d881d")} {/* ボタン */}
      {element("481bba70-6689-47ac-a5bb-a7e773aae884")} {/* ボタン */}
    </>
  );
}
