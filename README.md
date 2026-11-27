# react-maker 書き出しサイト

`npm ci` と `npm run build` で、TypeScriptの型チェックを通してから静的配信用の `dist/` を作ります。`npm run typecheck` で型チェックだけを実行でき、`npm run preview` で表示を確認できます。

## ファイルの持ち主

`react-maker/manifest.json` に、ファイルごとの持ち主と、書き出したツールの版、再生成の方法があります。

- `files.tool`：react-maker が管理します（先頭に印のコメント）。再生成で上書きされるので、直さないでください。ランタイムを新しくするときは、新しいZIPからこの一覧のファイルだけを上書きします
- `files.both`：`src/generated/project.json` と `src/components/project/`。編集GUIとエージェント・利用者の両方が直します
- `files.user`：`src/integrations/` など。ツールは最初に作るだけで、以後は触りません

画面データの再生成（編集GUIでの保存・画面データZIP）は `src/generated/` だけを書き換えます。使っていない機能のコードは入れません。

サイトの起動コードは `src/site.tsx` にあります。画面を描画する共有ランタイムはReactのJavaScript部品で、起動コードから型付きの窓口を使って呼び出します。

## 画面ごとのURL

画面ごとにURLがあります。開始画面は `/`、ほかの画面は `/コード名`（GUIの画面設定の「コード名（URLのパス）」。空欄なら画面名から自動で作ります）です。データ詳細を置いた画面は、選んだレコードのIDを含めます（`/event-detail/rec-1`）。ブラウザの戻る・進む、再読み込み、URLの共有が効きます。存在しないパスでは「ページが見つかりません」を表示します。

URLを直接開いたときにもサイトを表示するため、静的ホスティングでは「存在しないパスには `index.html` を返す」設定が必要です。

- Netlify：`public/_redirects`（同梱）がそのまま使えます
- Cloudflare Pages：ビルドのコマンドを `npm run build:cloudflare` にします。Cloudflare Pages ではリダイレクトがファイルより先に効くので、`_redirects` の「すべてを `index.html` へ」を外し、`dist/404.html` で表示します（下の「Cloudflare Pages で配信する」）
- GitHub Pages：ビルドで `dist/404.html`（`index.html` と同じ内容）を出力します
- Vercel：`vercel.json` に `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }` を置きます
- サブフォルダに置く場合は、`SITE_BASE=/サブフォルダ/ npm run build` でビルドします

## Cloudflare Pages で配信する

非公開のリポジトリで GitHub Pages を使えないときの選択肢です（Issue #250）。最初に1回だけ、Cloudflare の画面でリポジトリをつなぎます。

1. Cloudflare の「Workers & Pages」→「作成」→「Pages」→「Git に接続」で、GitHub の「Cloudflare Workers & Pages」App を入れ、このリポジトリだけを選ぶ
2. ビルドの設定：フレームワークは「なし」、ビルドのコマンドは `npm run build:cloudflare`、出力のフォルダは `dist`
3. 保存すると、既定のブランチ（本番）は `https://<プロジェクト名>.pages.dev` に、ほかのブランチは `https://<ブランチ名>.<プロジェクト名>.pages.dev` に置かれます（ブランチの確認用の URL には、検索に載せない `X-Robots-Tag: noindex` が付きます）
4. 確認用の URL にパスワードをかけるときは、プロジェクトの設定の「Enable access policy」（Cloudflare Access）を使います
5. 確認用の URL を消すときは、Cloudflare の画面のデプロイの一覧か、`npx wrangler pages deployment delete <デプロイの ID> --project-name <プロジェクト名>` で消します

## GitHub Pages で公開する・見てもらう

`.github/workflows/publish-site.yml`（同梱）が、プッシュのたびにビルドして GitHub Pages に置きます。

- 既定のブランチ（`main` など）：本番。`https://<owner>.github.io/<repo>/`（`public/CNAME` に独自ドメインがあれば、そのドメインのルート）
- ほかのブランチ：作りかけの画面を見てもらう閲覧用のURL。`…/preview/<ブランチ名>/`（`/` は `-` に、英数字と `._-` 以外は除く）
- 画面ごとのHTML（`/pricing/index.html` など）をビルドで作るので、画面のURLを直接開けます。共有のカード（OGP）も画面ごとになります
- `npm run build` の最後に `scripts/prerender.mjs` が、画面の中身を HTML に事前に描きます。JavaScript を切ったブラウザや検索でも中身が読めます（JavaScript が動けば React が描き直します）。データの取得先があるサイトでは、データ一覧・詳細は「読み込み中」として描きます。詳細画面・下書きの画面・404.html は事前に描きません
- 最初の一度だけ、GitHub の Settings → Pages の Source を「Deploy from a branch：`gh-pages` / (root)」にします。編集GUIの GitHub の画面の「閲覧用のURLを用意する」が、この設定とワークフローの配置を行います（GitHub App に Workflows と Pages の権限が要ります）
- リンクを知っている人は、誰でも閲覧用のURLを開けます。公開したくない案件では、このワークフローを消してください
- 閲覧用のURLには、部品のドキュメント（`…/preview/<ブランチ名>/design-system/`。目次と、部品ごとの `design-system/<部品>/`）も出ます。説明・バリアントの見本・プロパティ・使い方・使っている画面とトークンが1ページにまとまり、編集GUIに入らずに読めます。中身は `src/generated/component-docs.json`（編集GUIが作る）で、Storybook の Docs と同じ説明です。本番には出しません

## AI ツールから案件を引く（MCP）

Claude・Cursor などの AI ツールから、この案件のトークン・共通部品・画面・動きのプリセット・デザインチェックの結果を引けます（`scripts/mcp-server.mjs`。読み取り専用。依存パッケージなし）。結果には、編集GUIでその場所を開くリンクが付きます（リンクの先は、編集GUIのプロジェクト設定「AI ツール（MCP）」の「編集GUIのURL」）。

- Claude Code：このリポジトリで開けば、同梱の `.mcp.json` を読みます（初回に使うかを聞かれます）。手で足すなら `claude mcp add react-maker -- node scripts/mcp-server.mjs`
- Cursor：同梱の `.cursor/mcp.json` を読みます
- そのほか：コマンド `node scripts/mcp-server.mjs` を、このリポジトリのフォルダで起動する設定にします（`npm run mcp` でも動きますが、npm の見出しが標準出力に出る道具では `--silent` を付けます）

| 道具 | 使いどころ |
| --- | --- |
| `get_tokens` | 名前・種類でトークンを引く（値・参照・モード・CSS変数・Tailwind のクラス） |
| `get_components` | 共通部品（バリアント・状態・プロパティ・使っている画面） |
| `get_screens` | 画面（URL・データ・遷移先・操作） |
| `get_motion_presets` | 擬態語（「ぷにっと」）・用途から動きのプリセット |
| `search` | 名前が分からないとき、意味の近さで横断して探す |
| `design_check` | `npm run check:project` と同じ検査 |

プロンプト `review-ui`（中身は `react-maker/agents/ui-review.md`）は、案件に沿って UI をレビューし、根拠と、コーディング用のAIへの依頼文を出す手順です。

## アクセス解析・フォーム・Cookie の同意

編集GUIのプロジェクト設定「アクセス解析・フォーム・Cookie」で決めます（`project.json` の `services`）。

- Google Analytics 4：測定IDを入れると計測します。訪れた人が同意するまでは GA4 を読み込みません（同意モードの既定は「拒否」）。画面の切り替えもページビューとして送ります。同意のバナーと、決めたあとに変えるための「Cookie の設定」は `src/site-services.tsx`
- Cookie を使わないアクセス解析（Umami・GoatCounter）：`services.analytics` の設定で、自動の計測を止めて読み込み、画面の切り替えごとに1回だけページビューを送ります。Cookie を使わないので同意のバナーは出しません。閲覧用のURLの版（`VITE_RM_PREVIEW_REPO`）では、どの解析も読み込みません。設定を消すと、スクリプトも読み込みません。
- フォームの送信先：URL を入れると、フォームの内容を JSON で送ります（`_form` にフォームの名前）。応答が `{ "errors": [{ "field", "message" }] }` なら、項目ごとの誤りとして表示します。送り方を変えるときは `src/integrations/form-api.ts`（利用者のファイル）を直します

## 書体

GUIのプロジェクト設定「書体」で選んだ書体を使います。

- Google Fonts の書体は、`index.html` の `<link>` で、使う太さだけを読み込みます（`display=swap`）。日本語の書体は、使う文字の分だけ分割して読み込まれます
- 持ち込んだ書体（woff2）は `src/generated/fonts/` に入り、サイトと一緒に配信されます
- Google への通信をなくしたい場合は、[Fontsource](https://fontsource.org/)（`npm install @fontsource/noto-sans-jp` など）で書体を自前で配信し、`index.html` の Google Fonts の `<link>` を外して `src/integrations/site.css` で読み込んでください

## Tailwind CSS

GUIで設定した色・余白・配置・レイアウト・幅別・状態別の値は、要素ごとの読める Tailwind CSS のクラスになります（例：`flex flex-col gap-3 p-4 rounded-xl`）。クラスは `src/generated/project.json` の `elementClasses` に入り、`src/generated/styles.css` の `@source inline(...)` でビルド時に生成されます。

- 標準の刻みに合う値は標準のクラス（`p-4`）、合わない値は任意値（`p-[18px]`）
- 共通スタイル（トークン）は `@theme` の変数になり、クラスから名前で参照します（`bg-brand`、`rounded-card`）
- 幅別は `md:` などの標準の幅か `min-[400px]:`、状態別は `hover:` `active:` `focus-visible:` `disabled:`
- 対応する書き方がない宣言は、任意のプロパティ（`[letter-spacing:0.2em]`）になります

変換できない値を持つ要素は、共通の画面スタイルのインライン表示を使います。共通の画面スタイルや状態表示は `src/preview.css` から読み込み、手書き部品のクラスは `src/` から検出します。 [Tailwindのテーマ変数](https://tailwindcss.com/docs/theme)・[クラス検出](https://tailwindcss.com/docs/detecting-classes-in-source-files)

手書きのテーマやスタイルは `src/integrations/site.css` または別の手書きCSSに追加します。Tailwind対応前に書き出したサイトを移行する場合は、新しいソースZIPを基に、既存の部品やAPI設定を差分で統合してください。旧ランタイムのまま画面データを差し替える場合は従来のインライン表示が使われます。

## shadcn/ui の部品を追加する

編集GUIのプロジェクト設定「shadcn/ui」で土台を有効にしたソースZIPには、`components.json`・`src/lib/utils.ts`・必要な依存関係を含めます。新規案件は有効、以前の案件は設定を変えるまで無効です。

```sh
npm ci
npx shadcn@4.23.0 add button
npm run typecheck
npm run build
```

追加先は `src/components/ui/`、`@/` は `src/` です。CLI がCSSを足す先は手書き用の `src/integrations/site.css` で、再生成される `src/generated/styles.css` を編集しません。`components.json` も利用者が管理します。CLI は配布元から部品・依存を取得するので、更新の差分を確認してください。[公式の追加手順](https://ui.shadcn.com/docs/cli#add)

色・角丸はGUIの設定でトークンに対応づけ、未指定の役割には公式 neutral の値を使います。トークンのモードを切り替えると、部品にも反映します。通常はOSに追従し、`<html data-mode="モードのコード名">` で明示できます。`.dark` によるダーク表示にも対応します。[公式のテーマ](https://ui.shadcn.com/docs/theming)

追加したファイルはReactから直接読み込めます。GUIで配置する場合は、下記の `src/integrations/components.tsx` の `customComponents` に `defineComponent` でラッパーを登録してください。たとえば `Button` を import し、文字フィールドの `values.label` を表示し、`disabled={!interactive}` と `onClick={onActivate}` を渡します。CLIで追加しただけではGUIの部品一覧に自動登録されません。

## 独自React部品

`src/integrations/components.tsx` の `customComponents` に、安定したIDで `defineComponent(表示名, フィールド定義, React部品)` を登録します。`text`、`number`、`boolean`、`select`（`options` に選択肢）、`color`（`#RRGGBB` など）、`image`（素材かURL。部品には表示用のURLが渡り、未設定は空文字）には `label` と型に合った既定値 `initial` を指定します。`select` は要素設定でプルダウン、`color` はカラーピッカー、`image` は素材ライブラリから選べます。部品には型が付いた `values`、GUIで配置した `children`、操作可否の `interactive`、GUIで設定した画面へ遷移する `onActivate` が渡ります。

データ一覧を使うフィールドは `{ label: '関連情報', type: 'dataset' }` と定義します。GUIでは案件に登録したデータ一覧を選びます。画面データには参照IDを保存し、部品には選んだ一覧の項目定義・レコード・表示状態（`ready`、`empty`、`loading`、`error`）を渡します。未選択や参照切れの場合は `null` です。`loading` と `error` ではレコードは空配列です。部品がデータを更新したい場合は、自分の状態に持たせてください。

GUIの「コンポーネント」画面の「コードの部品」で作った部品は `src/components/project/<名前>.tsx` に書き出され、`src/components/project/index.ts` で登録されます（キーは画面データの部品ID）。書き出し先で直したら、GUI側のコードにも同じ変更を貼り付けてください。編集GUIは型を検査しないので、`npm run typecheck` で確かめます。

ツール全体で使う部品は、react-maker側の同じ登録ファイルに追加します。初回のReactソースZIPには登録ファイルと同じ実装が入ります。その後、書き出し先で部品の実装を変更した場合は、登録IDと利用中のフィールドを維持し、画面データZIPで `src/generated/` を更新します。

独自React部品に対応する前に書き出したサイトでは、最初に新しいReactソースZIPから `ScreenView.tsx` と部品の登録ファイルを取り込んでください。手書きの変更がある場合は差分を確認して統合します。

## 部品間の状態と操作

`src/integrations/component-runtime.tsx` の `useSharedComponentState(key, initial)` は、同じキーを使う登録部品で状態を共有します。キーに機能名と対象IDを含め、同じキーでは同じ値の型と初期値を使います。状態は画面を移動しても残ります。プレビュー枠ごとに状態を持ち、編集・操作モードの切り替えやページの再読み込みで初期値に戻ります。

操作は `useComponentAction(id, { run, preview })` で定義します。両方の処理が入力と `AbortSignal` を受け取り、`{ status: 'success', value }` または `{ status: 'empty' }` を返します。処理が失敗した場合は、表示用のメッセージを持つエラーを投げます。公開サイトは `run`、編集GUIの操作モードは `preview` を使います。失敗や結果なしからの再試行は、同じ入力でもう一度実行します。画面を離れた場合はキャンセルを通知するので、通信には信号を渡してください。

`defineComponent` の第4引数に `{ 操作ID: '表示名' }` を指定すると、要素設定の「部品の操作プレビュー」で処理中・結果なし・失敗を確認できます。通常に戻すと模擬処理を実行できます。`{ label: '表示名', unknown: true }` を指定した操作では「結果不明」も選べます。処理を実行したうえで応答が失われる場合は、部品側で `useComponentPreviewCondition(操作ID)` を読み取り、模擬処理と再試行を定義します。

サンプルとして用意する部品の登録定義には `sample: true` を付けます。GUIではテンプレートを開くときに追加候補に出ます。

## 新しいGitリポジトリに保存する

ZIPを展開したフォルダ（`package.json` がある場所）をターミナルで開き、次を実行します。

```sh
git init -b main
git add .
git commit -m "Initial site export"
```

GitHubにも保存する場合は、GitHubで空のリポジトリを作り、その画面に表示されたリポジトリURLを使います。

```sh
git remote add origin リポジトリURL
git push -u origin main
```

## サイトを更新する

react-makerの「書き出しとGit」から「画面データを書き出す」を選び、ZIPを展開して `src/generated/` の内容を差し替えます。`git diff` で変更を確認し、`git add src/generated` と `git commit -m "Update generated screens"` で保存します。接続設定と手書きコードはこのリポジトリで管理します。別のブラウザでGUI編集を再開するためのJSONは、react-makerの「編集用バックアップ」から保存できます。

公開する場合は `dist/` を静的ホスティングへ配置します。

## Storybook

書き出すときに「Storybook を含める」を選ぶと、`npm run storybook` で次の Story を見られます。

- 共通部品（`src/components/shared/`）ごとに、バリアント・データ（長文・空・画像なし）・状態（ホバー・フォーカス・押下）。Controls で props を変えられます
- 動きのプリセット（ボタンで再生）、デザイントークンの一覧、画面ごとの表示（ダミーデータ）
- ツールバーで、トークンのモード（ライト・ダーク）・動きを減らす・画面幅を切り替えられます

`stories/generated/` はツールが作り直します。自分の Story は `stories/` のほかの場所か、`src/` の `*.stories.tsx` に置くと、書き出し直しても残ります。

## データの取得とバックエンドへの引き継ぎ

データ一覧があるサイトでは、画面は `src/integrations/data-api.ts` の `dataApi` だけを呼んでデータを取得します（一覧・1件・ページ送り・並べ替え・絞り込み。型は `src/generated/data-types.ts`）。

- `.env.local` の `VITE_DATA_API_URL` が空ならブラウザ内のモック、URL を書けば本番のAPIに切り替わります。`VITE_DATA_MOCK_PATTERN`（empty・error・delay・long・missing・many）でモックの応答を変えられます
- `npm run mock:api`（`-- --pattern=error` など）で、API仕様どおりのモックのサーバーが http://localhost:4010 で動きます
- API仕様は `src/generated/openapi.json`、画面ごとの引き継ぎ資料は `src/generated/handoff.md`、前回の書き出しからの契約の変更は `src/generated/contract-changes.md` です
- 読み込み中・空・失敗・再試行の表示は、編集GUIの「要素の状態表示」の設定がそのまま使われます

`data-api.ts` は利用者のファイルなので、本番のAPIの実装を書いても、再書き出しで消えません。

## 注文API

注文APIの接続設定は `src/integrations/order-api.ts` にあります。HTTPスタブまたは接続先を使う場合は、`.env.example` を `.env.local` にコピーし、`VITE_ORDER_API_URL` を設定して再ビルドします。URLが空欄なら模擬注文が動きます。`VITE_` の値はブラウザから参照できます。
