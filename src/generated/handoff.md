# データの引き継ぎ資料

react-maker が書き出しました（保存版 5）。型は `src/generated/data-types.ts`、API仕様は `src/generated/openapi.json`、モックのサーバーは `npm run mock:api` です。

本番のAPIに切り替えるには、`.env.local` に `VITE_DATA_API_URL=https://…` を書きます（空ならブラウザ内のモック）。

画面・共通部品の状態と、条件・操作の順番は [振る舞いの表](./behavior.md) を確認してください。

## 注文

注文の部品を使うサイトでは、`src/integrations/order-api.ts`（OrderApi）が同じ形の差し替え口です（`VITE_ORDER_API_URL`）。
