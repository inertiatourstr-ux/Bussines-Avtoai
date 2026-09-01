/**
 * Журнал посещений сайта «Инерция».
 *
 * Одна строка на событие в базе D1. Ни кук, ни сторонних скриптов,
 * сырой IP не сохраняется: из него, юзер-агента, даты и соли считается
 * суточный хеш — он позволяет отличать посетителей внутри дня и ничего
 * не говорит о человеке за его пределами.
 *
 * POST /e        — приём события с сайта
 * GET  /stats    — сводка, доступ по ключу: /stats?key=…
 */

const TYPES = new Set([
  'pageview',        // открытие страницы
  'click_telegram',  // клик по любой кнопке связи
  'form_submit',     // отправлена форма заявки
  'calc_used',       // тронули ползунок калькулятора
  'demo_play',       // открыли ролик демонстрации
  'promo_click',     // клик по кнопке акции
]);

const ALLOWED_ORIGINS = [
  'https://inertiatourstr-ux.github.io',
  'http://localhost:5190',
  'http://127.0.0.1:5190',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request);
    if (url.pathname === '/e' && request.method === 'POST') return collect(request, env);
    if (url.pathname === '/lead' && request.method === 'POST') return lead(request, env);
    if (url.pathname === '/stats') return report(request, env, url);
    if (url.pathname === '/chatid') return chatId(request, env, url);
    return new Response('inertia log', { status: 200 });
  },
};

function cors(res, request) {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    // sendBeacon уходит в режиме include, без этого заголовка браузер режет ответ
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Access-Control-Max-Age', '600');
  }
  return res;
}

/** Суточный анонимный отпечаток: sha256(ip + ua + дата + соль), первые 16 символов. */
async function visitorHash(request, env, day) {
  const raw = [
    request.headers.get('CF-Connecting-IP') || '',
    request.headers.get('User-Agent') || '',
    day,
    env.HASH_SALT || 'inertia',
  ].join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function collect(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return cors(new Response('bad json', { status: 400 }), request);
  }

  const type = String(body.type || '');
  if (!TYPES.has(type)) return cors(new Response('bad type', { status: 400 }), request);

  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  await env.DB.prepare(
    'INSERT INTO events (ts, day, type, path, ref, src, visitor, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    now.toISOString(),
    day,
    type,
    cut(body.path, 200),
    cut(body.ref, 200),
    body.src === 'telegram' ? 'telegram' : 'web',
    await visitorHash(request, env, day),
    request.headers.get('CF-IPCountry') || ''
  ).run();

  return cors(new Response(null, { status: 204 }), request);
}

function cut(v, n) {
  return typeof v === 'string' ? v.slice(0, n) : '';
}

async function report(request, env, url) {
  if (!env.STATS_KEY || url.searchParams.get('key') !== env.STATS_KEY) {
    return new Response('нужен ключ: /stats?key=…', { status: 401 });
  }

  const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10) || 30, 365);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const byDay = await env.DB.prepare(
    `SELECT day,
            COUNT(*) FILTER (WHERE type='pageview')       AS views,
            COUNT(DISTINCT visitor)                        AS visitors,
            COUNT(*) FILTER (WHERE type='click_telegram') AS tg,
            COUNT(*) FILTER (WHERE type='form_submit')    AS forms
     FROM events WHERE day >= ? GROUP BY day ORDER BY day DESC`
  ).bind(since).all();

  const byType = await env.DB.prepare(
    'SELECT type, COUNT(*) AS n FROM events WHERE day >= ? GROUP BY type ORDER BY n DESC'
  ).bind(since).all();

  const bySrc = await env.DB.prepare(
    'SELECT src, COUNT(*) AS n FROM events WHERE day >= ? AND type = \'pageview\' GROUP BY src ORDER BY n DESC'
  ).bind(since).all();

  const byRef = await env.DB.prepare(
    `SELECT CASE WHEN ref = '' THEN '(прямой заход)' ELSE ref END AS ref, COUNT(*) AS n
     FROM events WHERE day >= ? AND type = 'pageview' GROUP BY 1 ORDER BY n DESC LIMIT 20`
  ).bind(since).all();

  const leads = await env.DB.prepare(
    `SELECT substr(ts, 1, 16) AS \u0432\u0440\u0435\u043c\u044f, name AS \u0438\u043c\u044f, contact AS \u043a\u043e\u043d\u0442\u0430\u043a\u0442,
            substr(task, 1, 80) AS \u0437\u0430\u0434\u0430\u0447\u0430, src AS \u043e\u0442\u043a\u0443\u0434\u0430,
            CASE sent WHEN 1 THEN 'да' ELSE 'нет' END AS \u0432_telegram
     FROM leads WHERE ts >= ? ORDER BY id DESC LIMIT 50`
  ).bind(since).all();

  return new Response(page(days, byDay.results, byType.results, bySrc.results, byRef.results, leads.results), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function table(head, rows, cols) {
  const body = rows.length
    ? rows.map(r => '<tr>' + cols.map(c => `<td>${esc(r[c])}</td>`).join('') + '</tr>').join('')
    : `<tr><td colspan="${cols.length}">пусто</td></tr>`;
  return `<h2>${head}</h2><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function esc(v) {
  return String(v ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

function page(days, byDay, byType, bySrc, byRef, leads) {
  return `<!doctype html><meta charset="utf-8"><title>Журнал · Инерция</title>
<style>
 body{font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;background:#E8E7E4;color:#111113;margin:0;padding:32px}
 h1{font-size:26px;letter-spacing:-.02em;margin:0 0 4px}
 h2{font-size:15px;text-transform:uppercase;letter-spacing:.12em;color:#8A8A90;margin:32px 0 10px}
 p.sub{color:#8A8A90;margin:0 0 8px}
 table{border-collapse:collapse;width:100%;max-width:760px;background:#fff;border:1px solid #D2D1CD;border-radius:12px;overflow:hidden}
 th,td{padding:9px 14px;text-align:left;border-bottom:1px solid #EFEEEB;font-variant-numeric:tabular-nums}
 th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8A8A90;font-weight:600}
 tr:last-child td{border-bottom:none}
</style>
<h1>Журнал посещений</h1><p class="sub">за последние ${days} дн.</p>
${table('Заявки', leads, ['время', 'имя', 'контакт', 'задача', 'откуда', 'в_telegram'])}
${table('По дням', byDay, ['day', 'views', 'visitors', 'tg', 'forms'])}
${table('По событиям', byType, ['type', 'n'])}
${table('Откуда открывали', bySrc, ['src', 'n'])}
${table('Источники перехода', byRef, ['ref', 'n'])}`;
}

/* ------------------------------------------------------------------ заявки */

/** Принимает форму, кладёт в базу и отправляет ботом в чат. */
async function lead(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return cors(json({ ok: false, error: 'bad json' }, 400), request);
  }

  // приманка для ботов: поле скрыто стилями, человек его не заполнит
  if (body.website) return cors(json({ ok: true }, 200), request);

  const name = cut(body.name, 80).trim();
  const contact = cut(body.contact, 120).trim();
  const task = cut(body.task, 2000).trim();
  const src = body.src === 'telegram' ? 'telegram' : 'web';

  if (name.length < 2 || contact.length < 5) {
    return cors(json({ ok: false, error: 'проверьте имя и контакт' }, 400), request);
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const visitor = await visitorHash(request, env, day);

  // не больше трёх заявок с одного отпечатка за десять минут
  const since = new Date(Date.now() - 10 * 60000).toISOString();
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM leads WHERE visitor = ? AND ts > ?'
  ).bind(visitor, since).first();
  if (recent && recent.n >= 3) {
    return cors(json({ ok: false, error: 'слишком часто, попробуйте позже' }, 429), request);
  }

  const row = await env.DB.prepare(
    'INSERT INTO leads (ts, name, contact, task, src, visitor, sent) VALUES (?, ?, ?, ?, ?, ?, 0) RETURNING id'
  ).bind(now.toISOString(), name, contact, task, src, visitor).first();

  const text = [
    'Заявка с сайта',
    '',
    'Имя: ' + name,
    'Контакт: ' + contact,
    task ? 'Задача: ' + task : 'Задача: не указана',
    '',
    'Откуда: ' + (src === 'telegram' ? 'мини-приложение' : 'сайт'),
    'Время: ' + now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  ].join('\n');

  let sent = 0;

  // почта: ключ Web3Forms не секретный, он задуман открытым
  if (env.W3F_KEY) {
    try {
      const r = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: env.W3F_KEY,
          subject: 'Заявка с сайта — ' + name,
          from_name: 'Инерция',
          'Имя': name,
          'Контакт': contact,
          'Задача': task || 'не указана',
          'Откуда': src === 'telegram' ? 'мини-приложение' : 'сайт',
        }),
      });
      if (r.ok) sent = 1;
    } catch { /* заявка уже в базе, письмо не критично */ }
  }

  if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
    try {
      const r = await fetch('https://api.telegram.org/bot' + env.TG_BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // без parse_mode: текст уходит как есть, разметку из полей не исполнить
        body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: text, disable_web_page_preview: true }),
      });
      sent = r.ok ? 1 : 0;
    } catch { sent = 0; }
  }

  if (sent && row) {
    await env.DB.prepare('UPDATE leads SET sent = 1 WHERE id = ?').bind(row.id).run();
  }

  // заявка в базе в любом случае — даже если бот не достучался
  return cors(json({ ok: true, delivered: !!sent }, 200), request);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Помогает узнать chat_id: напишите боту /start и откройте /chatid?key=… */
async function chatId(request, env, url) {
  if (!env.STATS_KEY || url.searchParams.get('key') !== env.STATS_KEY) {
    return new Response('нужен ключ: /chatid?key=…', { status: 401 });
  }
  if (!env.TG_BOT_TOKEN) return new Response('не задан секрет TG_BOT_TOKEN', { status: 500 });

  const r = await fetch('https://api.telegram.org/bot' + env.TG_BOT_TOKEN + '/getUpdates');
  const data = await r.json();
  const chats = {};
  for (const u of (data.result || [])) {
    const c = (u.message || u.channel_post || {}).chat;
    if (c) chats[c.id] = [c.title, c.username, c.first_name].filter(Boolean).join(' / ');
  }
  const rows = Object.entries(chats);
  const list = rows.length
    ? rows.map(([id, who]) => `<li><code>${esc(id)}</code> — ${esc(who)}</li>`).join('')
    : '<li>пусто: напишите боту /start и обновите страницу</li>';
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>chat_id</title>
     <body style="font:15px/1.6 Helvetica,Arial,sans-serif;padding:32px">
     <h1 style="font-size:20px">Кому бот может писать</h1><ul>${list}</ul>
     <p>Нужное значение положите в секрет: <code>npx wrangler secret put TG_CHAT_ID</code></p>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
