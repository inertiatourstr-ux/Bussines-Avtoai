CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,   -- момент события, ISO
  day     TEXT NOT NULL,   -- дата, для группировки
  type    TEXT NOT NULL,   -- pageview, click_telegram, form_submit, calc_used, demo_play, promo_click
  path    TEXT,            -- страница
  ref     TEXT,            -- откуда пришли
  src     TEXT,            -- web или telegram
  visitor TEXT,            -- суточный анонимный хеш, не восстанавливается до IP
  country TEXT             -- страна по данным Cloudflare
);
CREATE INDEX IF NOT EXISTS idx_events_day  ON events(day);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

CREATE TABLE IF NOT EXISTS leads (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  name    TEXT NOT NULL,
  contact TEXT NOT NULL,
  task    TEXT,
  src     TEXT,            -- web или telegram
  visitor TEXT,            -- тот же суточный хеш, нужен для ограничения частоты
  sent    INTEGER NOT NULL DEFAULT 0   -- 1, если бот доставил в чат
);
CREATE INDEX IF NOT EXISTS idx_leads_ts ON leads(ts);
