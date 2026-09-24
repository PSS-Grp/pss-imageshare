-- Card Cylinder のテーブル定義。
-- server.js が起動時にこのファイルを自動実行する(IF NOT EXISTS なので何度実行しても安全)。
-- 手動で作りたい場合は、Neon の「SQL Editor」にこの内容を貼り付けて実行する。

-- 画像グループ(タイトルなどの情報)。登録順(created_at, id)にカードへ割り当てられる。
CREATE TABLE IF NOT EXISTS image_groups (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  genre       TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT '',
  registrant  TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  memo        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- グループごとの画像(最大4枚)。slot 0 がカードのサムネイルになる。
-- 画像はブラウザ側で縮小済みのものを、バイナリ(BYTEA)のまま保存する。
CREATE TABLE IF NOT EXISTS group_images (
  group_id  INTEGER  NOT NULL REFERENCES image_groups(id) ON DELETE CASCADE,
  slot      SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 3),
  mime      TEXT     NOT NULL,
  data      BYTEA    NOT NULL,
  PRIMARY KEY (group_id, slot)
);
