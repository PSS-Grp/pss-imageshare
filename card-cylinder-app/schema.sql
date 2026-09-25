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
-- 画像本体は Supabase Storage の「groups/グループID/スロット番号」に置き、ここには種類だけを持つ。
CREATE TABLE IF NOT EXISTS group_images (
  group_id  INTEGER  NOT NULL REFERENCES image_groups(id) ON DELETE CASCADE,
  slot      SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 3),
  mime      TEXT     NOT NULL,
  PRIMARY KEY (group_id, slot)
);

-- 以前は画像を data 列(BYTEA)に保存していた。その列が残っている DB では、
-- 旧形式の画像行を消して列を削除する(ストレージへの移行はしない)。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'group_images' AND column_name = 'data') THEN
    DELETE FROM group_images;
    ALTER TABLE group_images DROP COLUMN data;
  END IF;
END $$;

-- 画像のバイト数(Storage 使用量の表示用)。この列ができる前に登録した画像は NULL で、
-- サーバーが起動時に Storage へ問い合わせて埋める。
ALTER TABLE group_images ADD COLUMN IF NOT EXISTS size INTEGER;
