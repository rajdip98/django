/* Front-end behaviour for the club portal: accessibility controls, mobile
   navigation, search overlay, gallery lightbox, counters and small helpers.
   No external dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var store = {
    get: function (key, fallback) {
      try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }
  };

  /* ---------------------------------------------------- accessibility */
  function applyPreferences() {
    root.setAttribute('data-theme', store.get('club-theme', 'light'));
    root.setAttribute('data-font', store.get('club-font', 'md'));
    root.setAttribute('data-contrast', store.get('club-contrast', 'normal'));
    syncPressedStates();
  }

  function syncPressedStates() {
    document.querySelectorAll('[data-font-set]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.fontSet === root.getAttribute('data-font')));
    });
    var contrastBtn = document.querySelector('[data-toggle-contrast]');
    if (contrastBtn) {
      contrastBtn.setAttribute('aria-pressed', String(root.getAttribute('data-contrast') === 'high'));
    }
    var themeBtn = document.querySelector('[data-toggle-theme]');
    if (themeBtn) {
      var dark = root.getAttribute('data-theme') === 'dark';
      themeBtn.setAttribute('aria-pressed', String(dark));
      themeBtn.textContent = dark ? '☀ Light' : '☾ Dark';
    }
  }

  document.addEventListener('click', function (event) {
    var fontBtn = event.target.closest('[data-font-set]');
    if (fontBtn) {
      store.set('club-font', fontBtn.dataset.fontSet);
      root.setAttribute('data-font', fontBtn.dataset.fontSet);
      syncPressedStates();
    }
    if (event.target.closest('[data-toggle-contrast]')) {
      var high = root.getAttribute('data-contrast') === 'high' ? 'normal' : 'high';
      root.setAttribute('data-contrast', high);
      store.set('club-contrast', high);
      syncPressedStates();
    }
    if (event.target.closest('[data-toggle-theme]')) {
      var theme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      store.set('club-theme', theme);
      syncPressedStates();
    }
  });

  /* ------------------------------------------------------- navigation */
  var navToggle = document.querySelector('.nav-toggle');
  var navList = document.getElementById('primary-navigation');
  if (navToggle && navList) {
    navToggle.addEventListener('click', function () {
      var open = navList.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }
  // On touch/mobile widths the first tap opens a submenu instead of following.
  document.querySelectorAll('.nav-list > li.has-children > a').forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (window.matchMedia('(max-width: 900px)').matches) {
        var parent = link.parentElement;
        if (!parent.classList.contains('open')) {
          event.preventDefault();
          parent.classList.add('open');
        }
      }
    });
  });

  /* ---------------------------------------------------- search overlay */
  var overlay = document.getElementById('search-overlay');
  function openSearch() {
    if (!overlay) return;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var input = overlay.querySelector('input[type="search"]');
    if (input) { input.focus(); input.select(); }
  }
  function closeSearch() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  document.querySelectorAll('[data-open-search]').forEach(function (btn) {
    btn.addEventListener('click', function (event) { event.preventDefault(); openSearch(); });
  });
  document.querySelectorAll('[data-close-search]').forEach(function (btn) {
    btn.addEventListener('click', closeSearch);
  });
  if (overlay) {
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeSearch();
    });
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { closeSearch(); closeLightbox(); }
    if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      event.preventDefault();
      openSearch();
    }
  });

  /* -------------------------------------------------------- lightbox */
  var lightbox = document.getElementById('lightbox');
  var tiles = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox]'));
  var currentIndex = -1;

  function renderLightbox(index) {
    if (!lightbox || index < 0 || index >= tiles.length) return;
    currentIndex = index;
    var tile = tiles[index];
    var figure = lightbox.querySelector('figure');
    var src = tile.dataset.full || '';
    var caption = tile.dataset.caption || '';
    var video = tile.dataset.video || '';

    // Titles and captions are entered by staff, so every value below is treated
    // as text and set through DOM properties — never parsed as markup.
    while (figure.firstChild) figure.removeChild(figure.firstChild);

    if (video && /^https?:\/\//i.test(video)) {
      var wrapper = document.createElement('p');
      wrapper.style.textAlign = 'center';
      var link = document.createElement('a');
      link.className = 'btn btn-gold';
      link.href = video;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = '▶ Open video in a new tab';
      wrapper.appendChild(link);
      figure.appendChild(wrapper);
    } else if (src) {
      var image = document.createElement('img');
      image.src = src;
      image.alt = caption;
      figure.appendChild(image);
    } else {
      var placeholder = document.createElement('div');
      placeholder.className = 'placeholder-art ph-frame ' + (tile.dataset.swatch || 'ph-0');
      placeholder.textContent = tile.dataset.initials || '';
      figure.appendChild(placeholder);
    }

    var figcaption = document.createElement('figcaption');
    figcaption.textContent = caption;
    figure.appendChild(figcaption);
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var close = lightbox.querySelector('.close');
    if (close) close.focus();
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';
    if (currentIndex > -1 && tiles[currentIndex]) tiles[currentIndex].focus();
    currentIndex = -1;
  }
  tiles.forEach(function (tile, index) {
    tile.addEventListener('click', function () { renderLightbox(index); });
  });
  if (lightbox) {
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) closeLightbox();
      if (event.target.closest('.close')) closeLightbox();
      if (event.target.closest('.next')) renderLightbox((currentIndex + 1) % tiles.length);
      if (event.target.closest('.prev')) renderLightbox((currentIndex - 1 + tiles.length) % tiles.length);
    });
    document.addEventListener('keydown', function (event) {
      if (!lightbox.classList.contains('is-open')) return;
      if (event.key === 'ArrowRight') renderLightbox((currentIndex + 1) % tiles.length);
      if (event.key === 'ArrowLeft') renderLightbox((currentIndex - 1 + tiles.length) % tiles.length);
    });
  }

  /* --------------------------------------------------- counters & misc */
  function animateCounters() {
    var counters = document.querySelectorAll('[data-count-to]');
    if (!counters.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      counters.forEach(function (el) { el.textContent = el.dataset.countTo + (el.dataset.suffix || ''); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        observer.unobserve(el);
        var target = parseInt(el.dataset.countTo, 10) || 0;
        var suffix = el.dataset.suffix || '';
        var start = performance.now();
        var duration = 1100;
        function step(now) {
          var progress = Math.min((now - start) / duration, 1);
          var eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(target * eased) + (progress === 1 ? suffix : '');
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { observer.observe(el); });
  }

  var toTop = document.querySelector('.to-top');
  if (toTop) {
    window.addEventListener('scroll', function () {
      toTop.classList.toggle('show', window.scrollY > 500);
    }, { passive: true });
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Notification dropdown in the header.
  var bell = document.querySelector('[data-toggle-notifications]');
  var notificationPanel = document.getElementById('notification-panel');
  if (bell && notificationPanel) {
    bell.addEventListener('click', function (event) {
      event.preventDefault();
      var hidden = notificationPanel.hasAttribute('hidden');
      if (hidden) { notificationPanel.removeAttribute('hidden'); }
      else { notificationPanel.setAttribute('hidden', ''); }
      bell.setAttribute('aria-expanded', String(hidden));
    });
    document.addEventListener('click', function (event) {
      if (!notificationPanel.contains(event.target) && !bell.contains(event.target)) {
        notificationPanel.setAttribute('hidden', '');
        bell.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Client-side validation feedback before the form reaches the server.
  document.querySelectorAll('form[data-validate]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      var invalid = null;
      form.querySelectorAll('[required]').forEach(function (field) {
        var wrapper = field.closest('.field');
        var ok = field.checkValidity();
        if (wrapper) wrapper.classList.toggle('has-error', !ok);
        if (!ok && !invalid) invalid = field;
      });
      if (invalid) {
        event.preventDefault();
        invalid.focus();
        invalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      var submit = form.querySelector('[type="submit"]');
      if (submit) {
        submit.classList.add('disabled');
        submit.textContent = 'Submitting…';
      }
    });
  });

  // Auto-submit filter selects (category / month pickers).
  document.querySelectorAll('[data-autosubmit]').forEach(function (select) {
    select.addEventListener('change', function () { select.form.submit(); });
  });

  applyPreferences();
  animateCounters();
})();
