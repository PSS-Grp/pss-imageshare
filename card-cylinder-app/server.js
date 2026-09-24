'use strict';

// Card Cylinder の Web サーバー。
// - 共通パスワード1つでのログイン(署名付き Cookie によるセッション)
// - 画像グループの一覧・登録・削除 API と、画像の配信
// - public/ 配下の画面(ログイン画面・カード表示画面)の配信
// データはすべて Neon(Postgres)に保存する。

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');

const { DATABASE_URL, SITE_PASSWORD, SESSION_SECRET } = process.env;
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 720;
const PORT = Number(process.env.PORT) || 3000;

for (const [key, value] of Object.entries({ DATABASE_URL, SITE_PASSWORD, SESSION_SECRET })) {
  if (!value) {
    console.error(`環境変数 ${key} が設定されていません(.env.example を参照)`);
    process.exit(1);
  }
}

// ---- データベース ----
// Neon はしばらく使われないと自動で休止し、接続が切れることがある。
// プール側で切断を検知してもプロセスが落ちないよう error をログに出すだけにしておく。
const pool = new Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 30000 });
pool.on('error', (err) => console.error('DB接続エラー:', err.message));

// ---- セッション ----
// Cookie の中身は「有効期限.署名」。署名は SESSION_SECRET を鍵にした HMAC なので、
// SESSION_SECRET を変えると全員のログインが切れる。
const COOKIE_NAME = 'cc_session';
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function issueToken() {
  const expires = String(Date.now() + SESSION_MS);
  return expires + '.' + sign(expires);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function isValidToken(token) {
  if (!token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature) return false;
  return safeEqual(signature, sign(expires)) && Number(expires) > Date.now();
}

function passwordMatches(input) {
  // 長さの違いで処理時間が変わらないよう、ハッシュ同士を比較する
  const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  return safeEqual(hash(input), hash(SITE_PASSWORD));
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

// ---- 入力チェック ----
const TEXT_FIELDS = { title: 200, genre: 100, category: 100, registrant: 100, address: 300, memo: 5000 };
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function parseGroupBody(body) {
  const group = {};
  for (const [field, maxLen] of Object.entries(TEXT_FIELDS)) {
    const value = typeof body[field] === 'string' ? body[field].trim() : '';
    if (value.length > maxLen) throw new HttpError(400, `${field} は${maxLen}文字以内で入力してください`);
    group[field] = value;
  }
  if (!group.title) throw new HttpError(400, 'タイトルを入力してください');

  const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
  group.images = images.map((dataUrl, slot) => {
    if (!dataUrl) return null;
    const m = typeof dataUrl === 'string' && DATA_URL_RE.exec(dataUrl);
    if (!m) throw new HttpError(400, `画像${slot + 1}の形式が正しくありません`);
    const data = Buffer.from(m[2], 'base64');
    if (data.length > MAX_IMAGE_BYTES) throw new HttpError(400, `画像${slot + 1}が大きすぎます`);
    return { slot, mime: m[1], data };
  }).filter(Boolean);
  return group;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// async ハンドラの例外を Express のエラー処理に渡す
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, '見つかりません');
  return id;
}

function parseSlot(value) {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) throw new HttpError(404, '見つかりません');
  return slot;
}

// ---- アプリ ----
const app = express();
app.set('trust proxy', 1); // Render のプロキシ越しでも req.secure を正しく判定する
app.disable('x-powered-by');

const PUBLIC_DIR = path.join(__dirname, 'public');

app.get('/login', (req, res) => {
  if (isValidToken(readCookie(req, COOKIE_NAME))) return res.redirect('/');
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  if (!passwordMatches(req.body.password || '')) {
    // 総当たりを遅らせるため、失敗時は少し待ってから返す
    return setTimeout(() => res.redirect('/login?error=1'), 800);
  }
  res.cookie(COOKIE_NAME, issueToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_MS,
  });
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect('/login');
});

// ここから下はログインが必要
app.use((req, res, next) => {
  if (isValidToken(readCookie(req, COOKIE_NAME))) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'ログインが必要です' });
  res.redirect('/login');
});

app.get('/api/groups', wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT g.id, g.title, g.genre, g.category, g.registrant, g.address, g.memo,
           COALESCE(array_agg(i.slot ORDER BY i.slot) FILTER (WHERE i.slot IS NOT NULL), '{}') AS slots
      FROM image_groups g
      LEFT JOIN group_images i ON i.group_id = g.id
     GROUP BY g.id
     ORDER BY g.created_at, g.id`);
  res.json(rows.map(({ slots, ...g }) => ({
    ...g,
    images: [0, 1, 2, 3].map((slot) => slots.includes(slot)),
  })));
}));

app.post('/api/groups', express.json({ limit: '15mb' }), wrap(async (req, res) => {
  const group = parseGroupBody(req.body || {});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO image_groups (title, genre, category, registrant, address, memo)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [group.title, group.genre, group.category, group.registrant, group.address, group.memo]);
    const id = rows[0].id;
    for (const img of group.images) {
      await client.query(
        'INSERT INTO group_images (group_id, slot, mime, data) VALUES ($1, $2, $3, $4)',
        [id, img.slot, img.mime, img.data]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}));

app.delete('/api/groups/:id', wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM image_groups WHERE id = $1', [parseId(req.params.id)]);
  if (!rowCount) throw new HttpError(404, '見つかりません');
  res.status(204).end();
}));

app.get('/api/groups/:id/images/:slot', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT mime, data FROM group_images WHERE group_id = $1 AND slot = $2',
    [parseId(req.params.id), parseSlot(req.params.slot)]);
  if (!rows.length) throw new HttpError(404, '見つかりません');
  // 登録後に画像が書き換わることはない(id は再利用されない)ので長めにキャッシュさせる
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.type(rows[0].mime).send(rows[0].data);
}));

app.use(express.static(PUBLIC_DIR));

app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  const message = status === 413 ? '画像の合計サイズが大きすぎます'
    : status >= 500 ? 'サーバーでエラーが発生しました' : err.message;
  res.status(status).json({ error: message });
});

// ---- 起動 ----
(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  app.listen(PORT, () => console.log(`Card Cylinder: http://localhost:${PORT}`));
})().catch((err) => {
  console.error('起動に失敗しました:', err);
  process.exit(1);
});
