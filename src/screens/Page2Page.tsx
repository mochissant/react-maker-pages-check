// react-maker が生成した画面「カート」（/page-2）。Issue #106
// コードで直してよい：クラス・属性（aria-*・data-*・id・title・role・lang）・文言・要素の前のコメントは、編集GUIに戻ります（docs/code-roundtrip.md）。
// それ以外の書き方（map・条件・フックなど）を使うと、このファイルは「コードで管理」になり、ツールは書き換えません。element('<id>') の要素は、共通の描画（ScreenView）が描きます。
import type { ScreenParts } from './types';

/** 画面の内容の署名。書き出したあとに project.json を直接書き換えると合わなくなり、そのあいだは共通の描画で表示する */
export const signature = "430fkg";

export default function Page2Page({ element }: ScreenParts) {
  return (
    <>
      <h1 className="element element-heading text-[24px] font-bold" data-element-id="8f58cd77-5bd4-49a8-9760-d751af8a853c">{"カート"}</h1>
      {element("dd0a7520-dbdf-4312-87b3-46e32529a050")} {/* カート明細 */}
      {element("987c081f-0670-4bc3-9d64-54cf6994ed2b")} {/* ボタン */}
      {element("5c5fd31e-fe6d-42c7-804f-fd47444f77fe")} {/* ボタン */}
    </>
  );
}
