/* Everything the pages need, in one small file. No libraries, no build step.
   If a browser blocks scripts entirely, every page still reads correctly —
   nothing here is required to see the content. */
(function () {
  'use strict';

  // ---- Content overrides --------------------------------------------------
  // assets/js/content.js is optional. When an administrator has published one,
  // its values replace the text that is written into the pages.
  var content = (typeof window.CLUB_CONTENT === 'object' && window.CLUB_CONTENT) || {};

  Object.keys(content).forEach(function (key) {
    var value = content[key];
    if (key === 'notices' || value === undefined || value === null || value === '') return;

    Array.prototype.forEach.call(
      document.querySelectorAll('[data-content="' + key + '"]'),
      function (node) {
        node.textContent = value;
        var prefix = node.getAttribute('data-content-href');
        if (prefix) {
          // tel: links must not carry spaces.
          node.setAttribute('href', prefix + (prefix === 'tel:' ? String(value).replace(/\s/g, '') : value));
        }
      }
    );
  });

  if (Array.isArray(content.notices) && content.notices.length) {
    var track = document.querySelector('[data-content-notices]');
    if (track) {
      track.textContent = '';
      // Printed twice so the strip scrolls without a visible gap.
      for (var pass = 0; pass < 2; pass++) {
        content.notices.forEach(function (notice) {
          var link = document.createElement('a');
          link.href = notice.href || 'notices.html';
          // Administrator text is inserted as text, never as markup.
          link.textContent = '\u25B8 ' + (notice.text || '');
          track.appendChild(link);
        });
      }
    }
  }

  // ---- Appearance ---------------------------------------------------------
  var root = document.documentElement;

  function remember(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private browsing */ }
  }

  function setAppearance(attribute, key, value) {
    root.setAttribute(attribute, value);
    remember(key, value);
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-appearance]');
    if (!button) return;
    var kind = button.getAttribute('data-appearance');

    if (kind === 'theme') {
      var dark = root.getAttribute('data-theme') === 'dark';
      setAppearance('data-theme', 'club-theme', dark ? 'light' : 'dark');
      button.setAttribute('aria-pressed', String(!dark));
      button.textContent = dark ? '☾ Dark' : '☀ Light';
    } else if (kind === 'contrast') {
      var high = root.getAttribute('data-contrast') === 'high';
      setAppearance('data-contrast', 'club-contrast', high ? 'normal' : 'high');
      button.setAttribute('aria-pressed', String(!high));
    } else if (kind === 'font') {
      var next = { md: 'lg', lg: 'xl', xl: 'md' };
      setAppearance('data-font', 'club-font', next[root.getAttribute('data-font') || 'md']);
    }
  });

  // ---- Mobile menu --------------------------------------------------------
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.mainnav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // ---- Home page slider ---------------------------------------------------
  var slider = document.querySelector('[data-slider]');
  if (slider) {
    var slides = Array.prototype.slice.call(slider.querySelectorAll('.slide'));
    var dots = Array.prototype.slice.call(slider.querySelectorAll('.slider-dots button'));
    var index = 0;
    var timer = null;

    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach(function (slide, i) { slide.classList.toggle('on', i === index); });
      dots.forEach(function (dot, i) { dot.setAttribute('aria-current', String(i === index)); });
    }

    function play() {
      var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (motion.matches) return;                 // respect the visitor's setting
      stop();
      timer = setInterval(function () { show(index + 1); }, 6000);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { show(i); play(); });
    });
    var prev = slider.querySelector('.slider-arrow.prev');
    var next = slider.querySelector('.slider-arrow.next');
    if (prev) prev.addEventListener('click', function () { show(index - 1); play(); });
    if (next) next.addEventListener('click', function () { show(index + 1); play(); });

    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', play);
    slider.addEventListener('focusin', stop);
    show(0);
    play();
  }

  // ---- Gallery lightbox ---------------------------------------------------
  var lightbox = document.querySelector('[data-lightbox]');
  if (lightbox) {
    var lbImage = lightbox.querySelector('img');
    var lbCaption = lightbox.querySelector('.cap');

    function openLightbox(button) {
      var figure = button.closest('figure');
      var image = figure.querySelector('img');
      if (image) { lbImage.src = image.src; lbImage.alt = image.alt || ''; }
      // Captions are written by the office; insert them as text, never markup.
      lbCaption.textContent = figure.getAttribute('data-caption') || (image && image.alt) || '';
      lightbox.hidden = false;
      lightbox.querySelector('.close').focus();
    }
    function closeLightbox() { lightbox.hidden = true; }

    document.addEventListener('click', function (event) {
      var opener = event.target.closest('.gallery button');
      if (opener) { openLightbox(opener); return; }
      if (event.target.closest('.lightbox .close') || event.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
    });
  }

  // ---- Filter buttons on list pages --------------------------------------
  Array.prototype.forEach.call(document.querySelectorAll('[data-filter-group]'), function (group) {
    var targetSelector = group.getAttribute('data-filter-group');
    group.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-filter]');
      if (!button) return;
      var wanted = button.getAttribute('data-filter');

      Array.prototype.forEach.call(group.querySelectorAll('button[data-filter]'), function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
      Array.prototype.forEach.call(document.querySelectorAll(targetSelector), function (item) {
        var category = item.getAttribute('data-category') || '';
        item.style.display = (wanted === 'all' || category === wanted) ? '' : 'none';
      });
    });
  });

  // ---- Search box on member and notice tables -----------------------------
  Array.prototype.forEach.call(document.querySelectorAll('[data-table-search]'), function (input) {
    var rows = document.querySelectorAll(input.getAttribute('data-table-search') + ' tbody tr');
    input.addEventListener('input', function () {
      var needle = input.value.trim().toLowerCase();
      var shown = 0;
      Array.prototype.forEach.call(rows, function (row) {
        var match = row.textContent.toLowerCase().indexOf(needle) !== -1;
        row.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      var note = document.querySelector(input.getAttribute('data-search-count'));
      if (note) note.textContent = shown + (shown === 1 ? ' entry' : ' entries') + ' shown';
    });
  });

  // ---- Contact form -------------------------------------------------------
  var form = document.querySelector('[data-contact-form]');
  if (form) {
    // The status strip sits above the form, not inside it, so look it up on the
    // page rather than within the form element.
    var status = document.querySelector('[data-status]');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var values = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        subject: form.subject.value.trim(),
        message: form.message.value.trim()
      };

      var problems = {};
      if (!values.name) problems.name = 'Please give your name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) problems.email = 'Please give a valid e-mail address.';
      if (!values.subject) problems.subject = 'Please give a subject.';
      if (values.message.length < 10) problems.message = 'Please write at least a sentence.';

      ['name', 'email', 'subject', 'message'].forEach(function (field) {
        var box = form.querySelector('[data-error-for="' + field + '"]');
        if (box) box.textContent = problems[field] || '';
        form[field].setAttribute('aria-invalid', problems[field] ? 'true' : 'false');
      });
      if (Object.keys(problems).length) { status.className = 'notice-strip error'; 
        status.textContent = 'Please correct the fields marked above.'; status.hidden = false; return; }

      status.className = 'notice-strip';
      status.textContent = 'Sending…';
      status.hidden = false;

      // The backend, if this site is served alongside it, stores the enquiry.
      fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      }).then(function (response) {
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      }).then(function (result) {
        form.reset();
        status.className = 'notice-strip ok';
        status.textContent = (result && result.message) || 'Thank you — your enquiry has reached the office.';
      }).catch(function () {
        // On a plain host there is no API. Say so, and hand over a way that works.
        var office = form.getAttribute('data-office-email') || '';
        var link = 'mailto:' + office
          + '?subject=' + encodeURIComponent(values.subject)
          + '&body=' + encodeURIComponent(values.message + '\n\n' + values.name + ' — ' + values.email
              + (values.phone ? ' — ' + values.phone : ''));
        status.className = 'notice-strip warn';
        status.innerHTML = '';
        status.appendChild(document.createTextNode(
          'This website is hosted without the enquiry service, so the form cannot deliver your '
          + 'message from here. '));
        var anchor = document.createElement('a');
        anchor.href = link;
        anchor.textContent = 'Send it by e-mail instead';
        status.appendChild(anchor);
        status.appendChild(document.createTextNode(' — your text is already filled in.'));
      });
    });
  }

  // ---- Year in the footer -------------------------------------------------
  Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (node) {
    node.textContent = String(new Date().getFullYear());
  });
})();
