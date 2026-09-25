# Card Cylinder(画像グループ管理付き・Web公開版)

12枚のカードが円柱状に並んで回転する3D表示に、ログイン・画像グループの登録・絞り込み検索を
つけた Web アプリです。グループ情報は Neon(Postgres)に、画像は Supabase Storage に保存され、
ブラウザを再読み込みしても消えません。

## できること

- 共通パスワード1つでログイン(誰がログインしても同じデータを見ます)
- 「画像を登録」から、画像4枚(1枚目がサムネイル)+タイトル/ジャンル/カテゴリー/登録者名/住所/メモ
  を1グループとして登録。登録は何グループでも可能です(タイトルのみ必須)。
- 登録したグループは、登録した順番でカードに自動的に割り当てられます。
  - グループが12件以下のときは、同じグループが複数のカードに繰り返し表示されます。
    (例: グループが4件なら、グループ1はカードの1・5・9に表示されます)
  - グループが13件以上のときは、最初は12件だけがカードに乗り、あとは各カードが
    回転して基準の0°の位置(円柱の奥側)を通過するたびに、次の順番のグループへ
    自動的に切り替わっていきます(コンベア式に全グループが順番に表示されていきます)。
- 「絞り込み」からカテゴリー・ジャンルの選択と、タイトル・メモのキーワード検索ができます。
  絞り込んだ状態では、その条件に合うグループだけを使って上記のカード割り当てが行われます。
- カードをクリックすると、上部2/3に画像(4枚、左右スワイプまたは ‹ › で切り替え)、下部1/3に
  タイトル・ジャンル・カテゴリー・登録者名・住所・メモを表示します。ここから削除もできます。
- ドラッグ/スワイプで手動回転、ボタンで一時停止・再生。

## 事前に必要なもの

- Node.js 18以上(ローカルで動かす場合のみ)
- Neon のプロジェクト(`pss-imageshare`)
- Supabase のプロジェクト(画像の保存先。Storage だけを使います)
- Render のアカウント(pss-attend と同じもの)

## 1. Neon の接続文字列を用意する

Neon のダッシュボードで `pss-imageshare` プロジェクトを開き、「Connect」から接続文字列
(`postgresql://...neon.tech/neondb?sslmode=require`)をコピーします。これが `DATABASE_URL` です。

テーブルはサーバーが起動時に `schema.sql` を実行して自動で作ります。

## 1-2. Supabase のキーを用意する

Supabase のダッシュボードでプロジェクトを開き、「Project Settings」→「API」から次の2つをコピーします。

- Project URL(`https://xxxx.supabase.co`)… `SUPABASE_URL`
- `service_role` キー … `SUPABASE_SERVICE_ROLE_KEY`(サーバー専用。公開しないこと)

画像用のバケット(既定名 `images`、`SUPABASE_BUCKET` で変更可)は、無ければサーバーが起動時に
非公開バケットとして自動で作ります。画像はサーバー経由でのみ配信されるので、公開にする必要はありません。

## 2. ローカルで動作確認する(任意)

```bash
cd card-cylinder-app
npm install
cp .env.example .env
# .env を開いて DATABASE_URL・SUPABASE_URL・SUPABASE_SERVICE_ROLE_KEY・SITE_PASSWORD・SESSION_SECRET を書き換える
npm start
```

`http://localhost:3000` を開き、設定した `SITE_PASSWORD` でログインできれば成功です。

## 3. Render で公開する

リポジトリ直下の `render.yaml`(Blueprint)に設定がまとまっています。

1. Render のダッシュボードで「New +」→「Blueprint」を選び、`PSS-Grp/pss-imageshare` リポジトリを選択します。
2. 入力を求められる環境変数を設定します。
   - `DATABASE_URL` … Neon の接続文字列
   - `SUPABASE_URL`・`SUPABASE_SERVICE_ROLE_KEY` … Supabase の Project URL と service_role キー
   - `SITE_PASSWORD` … サイトに入るための共通パスワード
   - `SESSION_SECRET` は Render が自動生成します。
   - `SESSION_HOURS`(ログインの有効時間、既定は720=30日)を変えたい場合は、Environment タブで追加します。
3. デプロイが完了すると、Render が発行するURL(`https://pss-imageshare.onrender.com` など)で
   アクセスできます。まず `/login` に飛ばされるので、`SITE_PASSWORD` でログインしてください。

## ディレクトリ構成

```
card-cylinder-app/
├─ server.js        … Express サーバー(ログイン・API・画面配信・画像の保存/配信)
├─ schema.sql       … データベースのテーブル定義(起動時に自動実行)
├─ package.json
├─ .env.example     … 環境変数のサンプル
└─ public/
   ├─ login.html    … ログイン画面
   ├─ index.html    … カード表示画面
   └─ app.js        … カードの3D表示・回転・登録・絞り込みのロジック
```

## API

すべてログインが必要です(未ログインは 401)。

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/groups` | 全グループ(登録順)。`images` は4枠それぞれに画像があるかどうか |
| POST | `/api/groups` | グループを登録。画像は data URL(JPEG/PNG/WebP/GIF)の配列で送る |
| DELETE | `/api/groups/:id` | グループを削除(画像も一緒に消える) |
| GET | `/api/groups/:id/images/:slot` | 画像本体(slot は 0〜3) |

## 注意点

- 画像はブラウザ側で長辺900pxに縮小してから、Supabase Storage に `groups/グループID/スロット番号` の
  名前で保存しています。Neon には画像の種類(MIME)だけを持たせています。グループを削除すると画像も消えます。
- 以前の版(画像を Neon の BYTEA 列に保存していた版)の DB で起動すると、旧形式の画像行は削除されます
  (グループ情報は残りますが、画像は登録し直しが必要です)。
- ログインは「全員共通の1つのパスワード」方式です。`SESSION_SECRET` を変えると全員のログインが切れます。
- Render の無料プランは、しばらくアクセスがないと休止します。休止後の最初のアクセスは表示まで
  数十秒かかることがあります。
