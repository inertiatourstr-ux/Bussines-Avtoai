/* Отправка событий в собственный журнал на Cloudflare.
   Адрес берётся из js/config.js. Пока он пуст — файл ничего не делает. */
(function () {
  'use strict';

  var ENDPOINT = window.INERTIA_API || '';
  if (!ENDPOINT) return;

  var inTelegram = !!window.TelegramWebviewProxy ||
                   /tgWebApp(Data|Version|Platform)=/.test(location.href) ||
                   document.documentElement.classList.contains('in-telegram');

  function send(type) {
    var body = JSON.stringify({
      type: type,
      path: location.pathname,
      // внутри Telegram referrer пуст, поэтому источник помечаем отдельно
      ref: document.referrer || '',
      src: inTelegram ? 'telegram' : 'web'
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT + '/e', new Blob([body], { type: 'application/json' }));
      } else {
        fetch(ENDPOINT + '/e', { method: 'POST', body: body, keepalive: true,
                                 headers: { 'Content-Type': 'application/json' } });
      }
    } catch (e) { /* журнал не должен ломать страницу */ }
  }

  send('pageview');

  // связь: кнопки в рельсе, в доке и в блоке контактов
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('a[href^="https://t.me/"]')) send('click_telegram');
    else if (t.closest('#promo .cta')) send('promo_click');
    else if (t.closest('.demo-tab')) send('demo_play');
  }, true);

  // ползунки калькулятора — считаем один раз за сеанс
  var calcCounted = false;
  ['people', 'hours', 'rate'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function () {
      if (calcCounted) return;
      calcCounted = true;
      send('calc_used');
    });
  });


})();
