(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  /* ---- режим закрепления рельса ---- */
  try {
    var rail = document.querySelector('.rail');
    var shell = document.querySelector('.shell');
    if (rail && shell) {
      var syncRail = function () {
        // Рельс закреплён сверху, пока помещается в экран. Если он выше окна,
        // ставим отрицательный top на величину превышения: тогда он один раз
        // проезжает вверх до своего низа и дальше стоит. С bottom у sticky
        // это не работает — он умеет только опускать блок, но не поднимать.
        var pad = parseFloat(getComputedStyle(shell).paddingTop) || 24;
        var over = rail.offsetHeight - (window.innerHeight - pad * 2);
        rail.style.top = over > 0 ? (pad - over) + 'px' : '';
      };
      syncRail();
      window.addEventListener('resize', syncRail);
      window.addEventListener('load', syncRail);
      if ('ResizeObserver' in window) {
        var ro = new ResizeObserver(syncRail);
        ro.observe(rail);
        ro.observe(document.documentElement);
      }
      if (window.visualViewport) window.visualViewport.addEventListener('resize', syncRail);
    }
  } catch (err) {
    console.warn('блок «закрепление рельса» не запустился:', err);
  }

  /* ---- калькулятор рутины ---- */
  try {
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
        function onMove() { fillTrack(input); recalc(); }
        input.addEventListener('input', onMove);
        input.addEventListener('change', onMove);   // подстраховка для вебвью Telegram
      });
      recalc();
      document.getElementById('calcForm').addEventListener('submit', function (e) { e.preventDefault(); });
    }
  } catch (err) {
    console.warn('блок «калькулятор рутины» не запустился:', err);
  }

  /* ---- появление карточек ---- */
  try {
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
  } catch (err) {
    console.warn('блок «появление карточек» не запустился:', err);
  }

  /* ---- активный пункт в рельсе ---- */
  try {
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
    // Telegram дописывает в адрес #tgWebAppData=... — это не селектор,
    // поэтому ищем по id, а не через querySelector, иначе бросается SyntaxError
    var hashId = location.hash.slice(1);
    if (hashId && document.getElementById(hashId)) setActive(hashId);
    else if (navLinks.length) setActive(navLinks[0].getAttribute('href').slice(1));

    if (hasIO && sections.length) {
      var sio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) setActive(en.target.id);
        });
      }, { rootMargin: '-20% 0px -60% 0px' });
      sections.forEach(function (s) { sio.observe(s); });
    }
  } catch (err) {
    console.warn('блок «активный пункт в рельсе» не запустился:', err);
  }

  /* ---- счётчики ---- */
  try {
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
  } catch (err) {
    console.warn('блок «счётчики» не запустился:', err);
  }

  /* ---- демонстрация: вкладки с роликами ---- */
  try {
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

    // выбор пользователя важнее автозапуска первого ролика по скроллу
    var demoChosen = false;

    // «Посмотреть в работе» с карточки сотрудника открывает его ролик
    document.querySelectorAll('.mate__demo').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = +btn.dataset.demo || 0;
        var demo = document.getElementById('demo');
        demoChosen = true;
        if (demoTabs.length) showDemo(i);
        if (demo) demo.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      });
    });

    if (demoTabs.length) {
      demoTabs.forEach(function (t, i) {
        t.addEventListener('click', function () { demoChosen = true; showDemo(i); });
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
            if (en.isIntersecting) { if (!demoChosen) showDemo(0); vio.disconnect(); }
          });
        }, { threshold: .25 });
        vio.observe(document.getElementById('demo'));
      } else if (firstVideo) {
        firstVideo.play().catch(function () { firstVideo.controls = true; });
      }
    }
  } catch (err) {
    console.warn('блок «демонстрация: вкладки с роликами» не запустился:', err);
  }

  /* ---- аккордеон ---- */
  try {
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
  } catch (err) {
    console.warn('блок «аккордеон» не запустился:', err);
  }


})();
