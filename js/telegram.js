/* Telegram Mini App: подключается только когда страница открыта внутри Telegram.
   На обычном сайте файл ничего не делает и SDK не грузит. */
(function () {
  'use strict';

  var inTelegram =
    !!window.TelegramWebviewProxy ||
    /tgWebApp(Data|Version|Platform)=/.test(location.href) ||
    /[?&]tg=1\b/.test(location.search);

  if (!inTelegram) return;

  var SDK = 'https://telegram.org/js/telegram-web-app.js';
  var CHAT = 'https://t.me/Webfusiondigital';
  var PAPER = '#E8E7E4';
  var EMBER = '#FF5A36';

  var el = document.createElement('script');
  el.src = SDK;
  el.onload = init;
  el.onerror = function () { console.warn('Telegram SDK не загрузился — работаем как обычный сайт'); };
  document.head.appendChild(el);

  function init() {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return;

    document.documentElement.classList.add('in-telegram');

    tg.ready();
    tg.expand();

    // вертикальный свайп по ползункам не должен закрывать окно (Bot API 7.7+)
    if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();

    // хром клиента под цвет бумаги: тёмной темы у этого макета нет
    try {
      if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor(PAPER);
      if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor(PAPER);
      if (typeof tg.setBottomBarColor === 'function') tg.setBottomBarColor(PAPER);
    } catch (e) { /* старый клиент — не критично */ }

    // высота вьюпорта клиента → своя переменная, 100vh внутри Telegram врёт
    function syncViewport() {
      var h = tg.viewportStableHeight || tg.viewportHeight;
      if (h) document.documentElement.style.setProperty('--tg-vh', h + 'px');
    }
    syncViewport();
    if (tg.onEvent) tg.onEvent('viewportChanged', syncViewport);

    // главная кнопка клиента заменяет собой нижний док
    if (tg.MainButton) {
      if (typeof tg.MainButton.setParams === 'function') {
        tg.MainButton.setParams({ text: 'Обсудить задачу', color: EMBER, text_color: '#FFFFFF' });
      } else {
        tg.MainButton.text = 'Обсудить задачу';
      }
      tg.MainButton.onClick(openChat);
      tg.MainButton.show();
    }

    function openChat() {
      haptic('impact', 'medium');
      if (typeof tg.openTelegramLink === 'function') tg.openTelegramLink(CHAT);
      else window.open(CHAT, '_blank');
    }

    function haptic(kind, style) {
      var h = tg.HapticFeedback;
      if (!h) return;
      try {
        if (kind === 'select' && h.selectionChanged) h.selectionChanged();
        else if (kind === 'impact' && h.impactOccurred) h.impactOccurred(style || 'light');
        else if (kind === 'notify' && h.notificationOccurred) h.notificationOccurred(style || 'success');
      } catch (e) { /* клиент без тактильной отдачи */ }
    }

    // ссылки на Telegram открываем средствами клиента, а не вложенным браузером
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="https://t.me/"]');
      if (!a) return;
      e.preventDefault();
      openChat();
    });

    // имя из профиля подставляем в форму, чтобы не набирать вручную
    var user = tg.initDataUnsafe && tg.initDataUnsafe.user;
    var nameField = document.getElementById('fName');
    if (user && user.first_name && nameField && !nameField.value) {
      nameField.value = [user.first_name, user.last_name].filter(Boolean).join(' ');
    }

    // тактильная отдача на переключении роликов и отправке формы
    document.querySelectorAll('.demo-tab').forEach(function (t) {
      t.addEventListener('click', function () { haptic('select'); });
    });
    var form = document.getElementById('leadForm');
    if (form) {
      form.addEventListener('submit', function () {
        setTimeout(function () {
          var ok = document.getElementById('formOk');
          haptic('notify', ok && !ok.hidden ? 'success' : 'error');
        }, 800);
      });
    }
  }
})();
