-- Отдельно, если таблица событий уже создана и накатывать всю схему заново не хочется:
--   npx wrangler d1 execute inertia-log --remote --file=leads.sql
CREATE TABLE IF NOT EXISTS leads (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  name    TEXT NOT NULL,
  contact TEXT NOT NULL,
  task    TEXT,
  src     TEXT,
  visitor TEXT,
  sent    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_leads_ts ON leads(ts);
