(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  /* ---- появление карточек ---- */
  var els = document.querySelectorAll('.reveal');
  if (!hasIO || reduced) {
    els.forEach(function (e) { e.classList.add('on'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('on'); io.unobserve(en.target); }
      });
    }, { threshold: .12 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---- активный пункт в рельсе ---- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.rail-nav a'));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);
  function setActive(id) {
    navLinks.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + id); });
  }

  // клик подсвечивает пункт сразу, не дожидаясь наблюдателя
  navLinks.forEach(function (a) {
    a.addEventListener('click', function () { setActive(a.getAttribute('href').slice(1)); });
  });
  if (location.hash && document.querySelector(location.hash)) setActive(location.hash.slice(1));
  else if (navLinks.length) setActive(navLinks[0].getAttribute('href').slice(1));

  if (hasIO && sections.length) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) setActive(en.target.id);
      });
    }, { rootMargin: '-20% 0px -60% 0px' });
    sections.forEach(function (s) { sio.observe(s); });
  }

  /* ---- счётчики ---- */
  function runCounter(el) {
    var target = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    if (reduced) { el.textContent = target + suffix; return; }
    var start = performance.now();
    (function tick(now) {
      var p = Math.min((now - start) / 1400, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }
  var counters = document.querySelectorAll('[data-count]');
  if (hasIO) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { runCounter(en.target); cio.unobserve(en.target); }
      });
    }, { threshold: .6 });
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(runCounter);
  }

  /* ---- демонстрация: вкладки с роликами ---- */
  var demoTabs = Array.prototype.slice.call(document.querySelectorAll('.demo-tab'));
  var demoPanels = Array.prototype.slice.call(document.querySelectorAll('.demo-panel'));

  function showDemo(i) {
    demoTabs.forEach(function (t, n) {
      var active = n === i;
      t.classList.toggle('on', active);
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
    });
    demoPanels.forEach(function (p, n) {
      var active = n === i;
      p.hidden = !active;
      var v = p.querySelector('video');
      if (!v) return;
      if (active) {
        if (reduced) { v.controls = true; return; }
        v.preload = 'auto';
        v.currentTime = 0;
        var played = v.play();
        // автовоспроизведение могли заблокировать — тогда отдаём управление пользователю
        if (played && played.catch) played.catch(function () { v.controls = true; });
      } else {
        v.pause();
      }
    });
  }

  if (demoTabs.length) {
    demoTabs.forEach(function (t, i) {
      t.addEventListener('click', function () { showDemo(i); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var next = (i + d + demoTabs.length) % demoTabs.length;
        showDemo(next);
        demoTabs[next].focus();
      });
    });

    // первый ролик запускаем, только когда блок появился в поле зрения
    var firstVideo = demoPanels[0].querySelector('video');
    if (reduced) {
      demoPanels.forEach(function (p) { var v = p.querySelector('video'); if (v) v.controls = true; });
    } else if (hasIO) {
      var vio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { showDemo(0); vio.disconnect(); }
        });
      }, { threshold: .25 });
      vio.observe(document.getElementById('demo'));
    } else if (firstVideo) {
      firstVideo.play().catch(function () { firstVideo.controls = true; });
    }
  }

  /* ---- аккордеон ---- */
  var items = document.querySelectorAll('.acc-item');
  items.forEach(function (item) {
    var q = item.querySelector('.acc-q');
    var a = item.querySelector('.acc-a');
    q.addEventListener('click', function () {
      var open = q.getAttribute('aria-expanded') === 'true';
      items.forEach(function (other) {
        other.querySelector('.acc-q').setAttribute('aria-expanded', 'false');
        other.querySelector('.acc-a').style.maxHeight = null;
      });
      if (!open) {
        q.setAttribute('aria-expanded', 'true');
        a.style.maxHeight = a.scrollHeight + 'px';
      }
    });
  });
  window.addEventListener('resize', function () {
    items.forEach(function (item) {
      var q = item.querySelector('.acc-q');
      var a = item.querySelector('.acc-a');
      if (q.getAttribute('aria-expanded') === 'true') a.style.maxHeight = a.scrollHeight + 'px';
    });
  });

  /* ---- калькулятор рутины ---- */
  var people = document.getElementById('people');
  var hours = document.getElementById('hours');
  var rate = document.getElementById('rate');
  var SAVE_SHARE = 0.6;  // доля рутины, которую снимает автоматизация
  var WEEKS = 47;        // рабочих недель в году
  var money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

  function fillTrack(input) {
    input.style.setProperty('--p', ((input.value - input.min) / (input.max - input.min)) * 100 + '%');
  }
  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }
  function recalc() {
    var p = +people.value, h = +hours.value, r = +rate.value;
    var yearHours = p * h * WEEKS;
    var yearCost = yearHours * r;
    var savedHours = Math.round(yearHours * SAVE_SHARE);

    document.getElementById('peopleOut').textContent = p + ' ' + plural(p, 'человек', 'человека', 'человек');
    document.getElementById('hoursOut').textContent = h + ' ' + plural(h, 'час', 'часа', 'часов');
    document.getElementById('rateOut').textContent = money.format(r) + ' ₽';
    document.getElementById('resNow').textContent = money.format(Math.round(yearCost)) + ' ₽';
    document.getElementById('resSave').textContent = money.format(Math.round(yearCost * SAVE_SHARE)) + ' ₽';
    document.getElementById('resHours').textContent = money.format(savedHours) + ' ' + plural(savedHours, 'час', 'часа', 'часов');
  }
  if (people) {
    [people, hours, rate].forEach(function (input) {
      fillTrack(input);
      input.addEventListener('input', function () { fillTrack(input); recalc(); });
    });
    recalc();
    document.getElementById('calcForm').addEventListener('submit', function (e) { e.preventDefault(); });
  }

  /* ---- форма заявки ---- */
  var form = document.getElementById('leadForm');
  if (!form) return;
  var okMsg = document.getElementById('formOk');

  function setError(id, text) {
    var field = document.getElementById(id);
    var slot = form.querySelector('.err[data-for="' + id + '"]');
    if (slot) slot.textContent = text || '';
    if (field && field.type !== 'checkbox') field.classList.toggle('bad', !!text);
  }
  function validContact(v) {
    return v.replace(/\D/g, '').length >= 10 || /^[^\s@]+@[^\s@]+\.[a-zа-я]{2,}$/i.test(v.trim());
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true;

    var name = document.getElementById('fName').value.trim();
    if (name.length < 2) { setError('fName', 'Напишите, как к вам обращаться'); ok = false; }
    else setError('fName', '');

    var contact = document.getElementById('fContact').value.trim();
    if (!contact) { setError('fContact', 'Оставьте телефон или почту'); ok = false; }
    else if (!validContact(contact)) { setError('fContact', 'Похоже на опечатку — проверьте контакт'); ok = false; }
    else setError('fContact', '');

    if (!document.getElementById('fAgree').checked) {
      setError('fAgree', 'Без согласия не сможем связаться'); ok = false;
    } else setError('fAgree', '');

    if (!ok) {
      var bad = form.querySelector('.bad');
      if (bad) bad.focus();
      return;
    }

    // Здесь подключается отправка на бэкенд / в CRM / в Telegram-бот.
    var btn = form.querySelector('button[type=submit]');
    var label = btn.childNodes[0];
    btn.disabled = true;
    label.nodeValue = 'Отправляем… ';
    setTimeout(function () {
      form.reset();
      btn.disabled = false;
      label.nodeValue = 'Отправить заявку ';
      okMsg.hidden = false;
      setTimeout(function () { okMsg.hidden = true; }, 6000);
    }, 700);
  });

  ['fName', 'fContact'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', function () { setError(id, ''); });
  });
  document.getElementById('fAgree').addEventListener('change', function () { setError('fAgree', ''); });
})();
