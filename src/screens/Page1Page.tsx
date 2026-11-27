// react-maker が生成した画面「商品一覧」（/page-1）。Issue #106
// コードで直してよい：クラス・属性（aria-*・data-*・id・title・role・lang）・文言・要素の前のコメントは、編集GUIに戻ります（docs/code-roundtrip.md）。
// それ以外の書き方（map・条件・フックなど）を使うと、このファイルは「コードで管理」になり、ツールは書き換えません。element('<id>') の要素は、共通の描画（ScreenView）が描きます。
import type { ScreenParts } from './types';

/** 画面の内容の署名。書き出したあとに project.json を直接書き換えると合わなくなり、そのあいだは共通の描画で表示する */
export const signature = "rta97d";

export default function Page1Page({ element }: ScreenParts) {
  return (
    <>
      <h1 className="element element-heading text-[24px] font-bold" data-element-id="e0d69fdb-cba1-4d14-a813-2ef740e3e570">{"商品一覧"}</h1>
      {element("171504c0-ad0b-40ef-8a38-5c334f5a6575")} {/* 商品一覧 */}
      {element("4248e305-ebcd-4836-9a8b-9ac068f88205")} {/* ボタン */}
    </>
  );
}
