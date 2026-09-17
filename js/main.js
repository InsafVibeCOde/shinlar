/* ============================================================
   ShinLar — логика страницы
   ============================================================ */
(function () {
  'use strict';

  var TG = 'https://t.me/Shinlar_kzn';

  document.documentElement.classList.add('js');   // включает CSS-анимации, завязанные на скрипт

  /* ── год в подвале ────────────────────────────────────── */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  /* ── шапка: обводка после скролла ─────────────────────── */
  var nav = document.getElementById('nav');
  function onScroll() { nav.classList.toggle('is-stuck', window.scrollY > 12); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── мобильное меню ───────────────────────────────────── */
  var burger = document.getElementById('burger');
  var menu   = document.getElementById('mobileMenu');
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      menu.hidden = open;
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        burger.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
      }
    });
  }

  /* ── появление блоков при скролле ─────────────────────── */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // карточки внутри одной сетки появляются друг за другом
  document.querySelectorAll('.grid').forEach(function (grid) {
    Array.prototype.forEach.call(grid.children, function (el, i) {
      if (el.classList.contains('reveal')) el.style.setProperty('--d', (i * 0.08) + 's');
    });
  });

  var reveals = document.querySelectorAll('.reveal');
  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ── подбор размера шин ───────────────────────────────── */
  var widths   = [155,165,175,185,195,205,215,225,235,245,255,265,275,285,295,305,315];
  var profiles = [30,35,40,45,50,55,60,65,70,75,80];
  var diameters= [13,14,15,16,17,18,19,20,21,22];

  function fill(select, values, selected, format) {
    if (!select) return;
    select.innerHTML = values.map(function (v) {
      return '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' +
             (format ? format(v) : v) + '</option>';
    }).join('');
  }

  var sizeW = document.getElementById('sizeW');
  var sizeH = document.getElementById('sizeH');
  var sizeD = document.getElementById('sizeD');
  var sizeOut = document.getElementById('sizeOut');

  fill(sizeW, widths, 205);
  fill(sizeH, profiles, 55);
  fill(sizeD, diameters, 16, function (v) { return 'R' + v; });

  function currentSize() {
    return sizeW.value + '/' + sizeH.value + ' R' + sizeD.value;
  }
  function syncSize() { if (sizeOut) sizeOut.textContent = currentSize(); }
  [sizeW, sizeH, sizeD].forEach(function (el) {
    if (el) el.addEventListener('change', syncSize);
  });
  syncSize();

  /* ── заявка: собираем текст, кладём в буфер, открываем Telegram ── */
  var form = document.getElementById('tireForm');
  var hint = document.getElementById('formHint');

  function say(text, state) {
    if (!hint) return;
    hint.textContent = text;
    hint.classList.toggle('is-error', state === 'error');
    hint.classList.toggle('is-ok', state === 'ok');
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name  = (document.getElementById('name').value || '').trim();
      var phone = (document.getElementById('phone').value || '').trim();
      var need  = document.getElementById('need').value;

      if (phone.replace(/\D/g, '').length < 10) {
        say('Проверьте номер телефона — нужно 10 цифр.', 'error');
        document.getElementById('phone').focus();
        return;
      }

      var message =
        'Заявка с сайта ShinLar\n' +
        'Размер: ' + currentSize() + '\n' +
        'Нужно: ' + need + '\n' +
        (name ? 'Имя: ' + name + '\n' : '') +
        'Телефон: ' + phone;

      var opened = window.open(TG, '_blank', 'noopener');

      function finish(copied) {
        say(copied
          ? 'Заявка скопирована — вставьте её в чат с @Shinlar_kzn.'
          : 'Напишите в Telegram: ' + currentSize() + ' · ' + need + ' · ' + phone + '.', 'ok');
        if (!opened) window.location.href = TG;
      }

      // запасной способ — работает и без https, и при открытии файла напрямую
      function legacyCopy() {
        try {
          var ta = document.createElement('textarea');
          ta.value = message;
          ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return ok;
        } catch (err) { return false; }
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(message).then(
          function () { finish(true); },
          function () { finish(legacyCopy()); }
        );
      } else {
        finish(legacyCopy());
      }
    });
  }

  /* ── карта грузится по клику, а не на старте ──────────── */
  var mapLoad = document.getElementById('mapLoad');
  var map = document.getElementById('map');
  if (mapLoad && map) {
    mapLoad.addEventListener('click', function () {
      var iframe = document.createElement('iframe');
      iframe.src = 'https://yandex.ru/map-widget/v1/?text=' +
        encodeURIComponent('Казань, улица Бурхана Шахиди, 26 корпус 1') + '&z=17';
      iframe.loading = 'lazy';
      iframe.title = 'ShinLar на карте — Казань, ул. Бурхана Шахиди, 26 корп. 1';
      iframe.setAttribute('allowfullscreen', '');
      map.innerHTML = '';
      map.appendChild(iframe);
    });
  }


  /* ── индикатор прочитанного в шапке ───────────────────── */
  var progress = document.getElementById('navProgress');
  function updateProgress() {
    if (!progress) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  /* ── подсветка карточки за курсором ───────────────────── */
  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.card, .quote, .price-extra div').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ── счётчики в плашке статистики ─────────────────────── */
  function runCounter(el) {
    var to = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    if (reduceMotion) { el.textContent = to + suffix; return; }
    var start = performance.now(), dur = 1100;
    (function step(now) {
      var t = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(to * eased) + suffix;
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  var counters = document.querySelectorAll('[data-count]');
  if (window.IntersectionObserver) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { runCounter(entry.target); co.unobserve(entry.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { co.observe(el); });
  } else {
    counters.forEach(runCounter);
  }

  /* ── строки прайса проявляются по очереди ─────────────── */
  var priceTable = document.querySelector('.price');
  if (priceTable && window.IntersectionObserver) {
    var po = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { priceTable.classList.add('is-in'); po.disconnect(); }
    }, { threshold: 0.2 });
    po.observe(priceTable);
  } else if (priceTable) {
    priceTable.classList.add('is-in');
  }

  /* ── FAQ: плавное раскрытие и закрытие ────────────────── */
  document.querySelectorAll('.faq details').forEach(function (details) {
    var summary = details.querySelector('summary');
    var wrap = details.querySelector('.faq__wrap');
    if (!summary || !wrap) return;

    summary.addEventListener('click', function (e) {
      e.preventDefault();

      if (!details.open) {
        // закрываем соседей — аккордеон
        document.querySelectorAll('.faq details[open]').forEach(function (other) {
          if (other !== details) closeItem(other);
        });
        details.open = true;
        requestAnimationFrame(function () { details.classList.add('is-open'); });
      } else {
        closeItem(details);
      }
    });

    function closeItem(el) {
      el.classList.remove('is-open');
      var w = el.querySelector('.faq__wrap');
      if (reduceMotion) { el.open = false; return; }
      var closed = false;
      var done = function (ev) {
        if (ev && ev.propertyName !== 'grid-template-rows') return;
        if (closed) return;
        closed = true;
        el.open = false;
        w.removeEventListener('transitionend', done);
      };
      w.addEventListener('transitionend', done);
      setTimeout(done, 420);
    }
  });

  /* ── лёгкий параллакс плашки статистики ───────────────── */
  if (!reduceMotion) {
    var stats = document.querySelector('.hero__stats');
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking || !stats) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = Math.min(window.scrollY, 600);
        stats.style.transform = 'translateY(' + (y * -0.06) + 'px)';
        ticking = false;
      });
    }, { passive: true });
  }

})();
