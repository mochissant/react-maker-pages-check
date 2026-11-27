# react-maker のサイト：エージェント向けの手引き

このリポジトリは react-maker（ブラウザで画面を組み立てるツール）が書き出した React + Tailwind CSS のサイトです。
画面・要素・トークン・動きは **`src/generated/project.json`** にあります。ブラウザで編集GUIを操作せずに、このファイルを直接書き換えて構いません。

## 作業の流れ

1. `src/generated/project.json` を書き換える（形は `react-maker/project.schema.json`。JSON Schema）
2. `npm run check:project` で確かめる。要修正が0件になるまで直す（`-- --json` で機械が読める結果）
3. `npm run build` で型検査とビルドを確かめる
4. 編集GUIで開き直すと、変更が反映される（GUIで保存すると、クラスや styles.css を作り直す）

## 案件のことを調べる（MCP）

トークン・共通部品・画面・動きのプリセット・デザインチェックは、MCP サーバー（`node scripts/mcp-server.mjs`。Claude Code は同梱の `.mcp.json` で使える）で引けます。値を推測せず、`get_tokens`・`get_components`・`search` で確かめてください。UI のレビューの手順は `react-maker/agents/ui-review.md`。

## ファイルの境界

| 場所 | 誰が直すか |
| --- | --- |
| `src/generated/project.json` | エージェントもGUIも直す（往復できる）。`elementClasses`・`elementSignatures` は生成物なので直さない |
| `src/generated/styles.css`・`src/generated/*` のほか | GUIの保存・書き出しで作り直す。手で直さない |
| `src/screens/*Page.tsx`（画面のファイル） | エージェントも直してよい。`data-element-id` を持つ要素のクラス・属性（aria-*・data-*・id・title・role・lang）・文言 `{"…"}`・要素の前のコメントは、GUIに戻る。map・条件・フック・ほかの import を使うと「コードで管理」になり、ツールはそのファイルを書き換えない（docs/code-roundtrip.md） |
| `src/ScreenView.tsx` など `src/` 直下の共有ランタイム | ツールが管理する。直さない |
| `src/integrations/`・`src/components/project/` | 利用者が管理する。部品やAPIの差し替えはここに書く |

スタイルを直接書き換えた要素は、書き出し時のクラスではなく描画時のスタイルで表示されるので、見た目はすぐ変わります。

## 画面と要素

- 画面：`screens[]` に `{ "id": "一意の文字列", "name": "画面名", "elements": [] }`。最初の画面は `startScreenId`
- 要素：`{ "id", "type", "style", "tokenRefs", "children" }`。`type` は container・heading・text・image・button・icon など
- 文言は `text`、見出しの大きさは `level`（1〜6）、画像は `src` と `alt`（飾りなら `decorative: true`）
- ボタンの遷移先は `targetScreenId`（画面の id）
- id は新しく作るたびに一意にする（UUID でよい）。既存の id を変えない

## トークンと共通部品（生の値を書かない）

- 色・余白・角丸などは、`style` に生の値を書かず、`tokenRefs` でトークンを使う：`"tokenRefs": { "backgroundColor": "<トークンのid>" }`
- 同じ見た目を何度も使うなら、`designSystem.components` の共通部品を `componentId` で置く
- 検証コマンドは、トークンと同じ値の生の値を「要確認」で知らせる

この案件のトークン（22件。先頭60件）：

| 名前 | id | 種類 | CSS変数 |
| --- | --- | --- | --- |
| メイン | `73480f9b-ef03-4b96-a4c4-1bd3f08f139b` | color | `brand` |
| メインの上の文字 | `87e78ecd-7c79-4c72-8999-65f8a5f1f96c` | color | `on-brand` |
| 面 | `0188c498-cff5-4c13-8d82-59c049949bec` | color | `surface` |
| 補足の文字 | `ab2cbfe6-8209-4142-a1ba-6c6f8dffad68` | color | `muted` |
| 線 | `c9de6e60-7209-4604-8f9b-aa74398158b7` | color | `line` |
| カードの角丸 | `ddd64de1-a890-4198-8d71-0e1698c2219f` | radius | `card` |
| セクションの余白 | `6c992461-281b-452b-bd37-59c9277b59b6` | spacing | `section` |
| 余白L | `b4beca67-657b-4bf6-a27d-fc207e6ba139` | spacing | `space-l` |
| 余白S | `b233360f-6345-40e5-90ea-829f807e7c19` | spacing | `space-s` |
| 余白M | `f1707823-613d-4ce9-bce9-1917a5b4b50b` | spacing | `space-m` |
| 余白ML | `c2aab45b-6374-4f64-9f61-e38534b868c4` | spacing | `space-ml` |
| ヘッダーの背景（半透明） | `0cc5314d-9025-4a80-9dae-dfa30df04ae1` | color | `header-glass` |
| 文字 1.25rem | `c081fc49-3ef5-4975-a60a-f36e710b6dc4` | fontSize | `text-1-25` |
| 文字 2.75rem | `f803bdef-dd07-4141-9736-ffa046c767a5` | fontSize | `text-2-75` |
| 余白XS | `d4064143-1d3e-4b49-ae6d-4a9a30c94031` | spacing | `space-xs` |
| 文字 2.5rem | `1fa7cb14-b4f1-49af-88a0-fccce5e39587` | fontSize | `text-2-5` |
| 文字 1.125rem | `62ddd0f1-94d6-4337-86d2-5f48be944436` | fontSize | `text-1-125` |
| 文字 0.875rem | `b804f3f0-fc3f-4932-9d34-c9883f18bf1c` | fontSize | `text-0-875` |
| 文字 2rem | `d73690b4-7d0f-4dd8-9a89-31d6e534aacf` | fontSize | `text-2` |
| 文字 | `e217a90e-7fd7-4d18-9083-e1b474e339c8` | color | `text` |
| 文字 1.0625rem | `f5596fcc-d3bf-4106-a9e2-30c8297ecc07` | fontSize | `text-1-0625` |
| 余白XL | `5406f674-9c14-4912-80fd-3faa0905a86b` | spacing | `space-xl` |


## 動き（擬態語のプリセット）

要素の `animations[]` に、プリセットの `motion` を写し、`"preset": "<id>"` と一意の `id` を足します。

| 擬態語 | id | 主な用途 | きっかけ | 動きを減らす設定では |
| --- | --- | --- | --- | --- |
| ぷにっ・ぷに・ぷにぷに | `puni` | ボタン、カード | 押したとき | 動かさない |
| ぽよん・ぽよっ・ぼよん | `poyon` | モーダル、バッジ | 画面を開いたとき | 不透明度だけ |
| ふわっ・ふわ・ふわり・ふんわり | `fuwa` | 一覧の登場 | スクロールで見えたとき | 不透明度だけ |
| すっ・すー・すいっ | `su` | メニュー、シート | 画面を開いたとき | 不透明度だけ |
| ぴょこ・ぴょこっ・ぴょこん・ひょこ | `pyoko` | 通知、フローティングボタン | 画面を開いたとき | 不透明度だけ |
| ぐいっ・ぐい・ぐいーん | `gui` | 引っ張って更新、ドラッグ | 押したとき | 動かさない |
| ぶるっ・ぶる・ぶるぶる・ぷるぷる | `buru` | 入力エラー | 画面を開いたとき | 動かさない |
| しゅわっ・しゅわ・しゅわしゅわ | `shuwa` | 現れるとき（消えるときは「しゅわっと消える」） | 画面を開いたとき | 不透明度だけ |
| しゅわっと消える・しゅわしゅわ消える | `shuwa-out` | 削除、閉じる、画面から出るとき | 画面から出るとき | 不透明度だけ |
| すっと消える・すっと引く | `su-out` | メニュー、シートを閉じる、画面から出るとき | 画面から出るとき | 不透明度だけ |
| ドン・どん・どーん・ドーン | `don` | 強調、達成 | 画面を開いたとき | 不透明度だけ |
| ゆらっ・ゆら・ゆらり | `yura` | 視差（パララックス・parallax）、背景と手前を別の速さで | scroll | 動かさない |
| くるっ・くる・くるり・くるん | `kuru` | カードを裏返して見せる（3D） | 画面を開いたとき | 不透明度だけ |
| ぐらっ・ぐら・ぐらり | `gura` | ホバーで傾く（3D・チルト） | ホバー | 動かさない |
| きょろっ・きょろ・きょろきょろ | `kyoro` | マウスの位置に合わせて傾ける（3D・チルト） | tilt | 動かさない |
| くいっ・くい | `kui` | スクロールに合わせて傾ける（3D） | scroll | 動かさない |
| じわっ・じわ・じわじわ・じんわり | `jiwa` | ホバー、選択 | ホバー | 不透明度だけ |

例：「この一覧を、ふわっと順番に出して」→ 一覧のコンテナに

```json
{ "id": "<新しいid>", "preset": "fuwa", "trigger": "inView", "effect": { "opacity": 0, "y": 16 }, "duration": 520, "easing": "emphasized", "stagger": { "interval": 80 }, "delay": 0 }
```

### 新しいプリセットを足す

辞書にない動きは、`motionPresets[]` に `{ "id", "names": ["擬態語"], "use": "用途", "reduced": "opacity" | "none", "motion": { … } }` を足します。GUIの「モーション」で、擬態語から選べるようになります。

## 部品を足す

- 案件だけの React 部品は `src/components/project/<名前>.tsx` に `defineComponent(表示名, 項目, 部品)` を default export し、`src/components/project/index.ts` に登録します。GUIの「コンポーネント」→「コードの部品」にも同じコードを入れると、GUIで配置できます
- 項目の型：text・number・boolean・select（options）・color・image・dataset
