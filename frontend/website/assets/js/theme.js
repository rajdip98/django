/* ---------------------------------------------------------------------------
   theme.js — puts the Admin Panel's settings onto the page.

   assets/js/content.js carries the settings. This file reads them and applies
   them: logo, club name, typefaces, colours, banners, header, footer and
   photographs. It runs before site.js so the slider it builds is picked up.

   Nothing here is required. With no content.js, or with this file missing, every
   page still shows the design and text written into the .html file itself.

   Everything an administrator types is inserted as text, never as markup, and
   every address is checked before it is used. A caption cannot become a script.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var DRAFT_KEY = 'club-panel-draft';

  // ---- Where the settings come from ---------------------------------------
  // Normally content.js. With ?preview=1 the panel's unpublished draft is used
  // instead, so an administrator can see a change before publishing it.
  function settings() {
    var preview = /[?&]preview=1/.test(window.location.search);
    if (preview) {
      try {
        var raw = window.localStorage.getItem(DRAFT_KEY);
        if (raw) {
          var draft = JSON.parse(raw);
          draft.__preview = true;
          return draft;
        }
      } catch (e) { /* fall through to the published file */ }
    }
    return (typeof window.CLUB_CONTENT === 'object' && window.CLUB_CONTENT) || null;
  }

  var C = settings();
  if (!C) return;

  // ---- Small helpers -------------------------------------------------------
  function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function isFilled(value) { return typeof value === 'string' && value.trim() !== ''; }
  function each(list, fn) { Array.prototype.forEach.call(list || [], fn); }
  function find(selector) { return document.querySelector(selector); }

  /* An address typed by an administrator must not be able to run code.
     Allowed: a page on this site, an anchor, http(s), mailto:, tel:.
     Refused: anything else, including javascript: and data: in a link. */
  function safeUrl(value, fallback) {
    if (!isFilled(value)) return fallback || '';
    var url = value.trim();
    if (/^\s*(javascript|vbscript|data|file):/i.test(url)) return fallback || '';
    return url;
  }

  /* An image may be a file already on the host (assets/img/…) or a picture the
     administrator chose from their computer, which arrives as a data: URL. */
  function safeImage(value) {
    if (!isFilled(value)) return '';
    var url = value.trim();
    if (/^data:image\//i.test(url)) return url;
    if (/^(javascript|vbscript|data|file):/i.test(url)) return '';
    return url;
  }

  function cssUrl(value) {
    return 'url("' + String(value).replace(/["\\]/g, '\\$&') + '")';
  }

  function link(label, href, fallbackHref) {
    var a = document.createElement('a');
    a.href = safeUrl(href, fallbackHref || '#');
    a.textContent = label;                 // text, never markup
    return a;
  }

  var extraCss = [];
  function rule(text) { extraCss.push(text); }

  // ---- 1. Colours ----------------------------------------------------------
  // Each value maps onto a custom property the stylesheet already uses, so one
  // colour change repaints the whole site.
  var COLOUR_MAP = {
    primary: ['--navy-800', '--navy-900'],
    primaryLight: ['--navy-700', '--navy-600'],
    accent: ['--gold'],
    accentSoft: ['--gold-soft'],
    page: ['--page'],
    surface: ['--surface'],
    ink: ['--ink'],
    line: ['--line']
  };

  function applyColours(theme) {
    if (!isObject(theme)) return;
    var root = document.documentElement;
    Object.keys(COLOUR_MAP).forEach(function (key) {
      var value = theme[key];
      if (!isFilled(value) || !/^#[0-9a-f]{3,8}$/i.test(value.trim())) return;
      COLOUR_MAP[key].forEach(function (property) {
        root.style.setProperty(property, value.trim());
      });
    });
    // The dark and high-contrast modes set their own page colours; an
    // administrator's choice belongs to the ordinary light mode only.
    if (isFilled(theme.page) || isFilled(theme.surface) || isFilled(theme.ink)) {
      rule('html[data-theme="dark"], html[data-contrast="high"] {'
         + '--page: revert; --surface: revert; --ink: revert; --line: revert; }');
    }
  }

  // ---- 2. Typefaces --------------------------------------------------------
  function applyFonts(fonts) {
    if (!isObject(fonts)) return;
    var root = document.documentElement;

    if (isFilled(fonts.headingFamily)) root.style.setProperty('--serif', fonts.headingFamily);
    if (isFilled(fonts.bodyFamily)) root.style.setProperty('--sans', fonts.bodyFamily);

    var scale = parseFloat(fonts.scale);
    if (isFinite(scale) && scale >= 80 && scale <= 150) {
      rule('html { font-size: ' + scale + '%; }');
    }
    if (fonts.headingWeight) {
      rule('h1, h2, h3, h4, .masthead .titles h1 { font-weight: ' + (parseInt(fonts.headingWeight, 10) || 700) + '; }');
    }
    if (fonts.headingSpacing) {
      var spacing = parseFloat(fonts.headingSpacing);
      if (isFinite(spacing)) rule('h1, h2, h3 { letter-spacing: ' + spacing + 'em; }');
    }

    // Typefaces that are not on the visitor's computer are fetched from Google
    // Fonts. If that request fails — no connection, or a blocked network — the
    // rest of the stack in --serif / --sans still renders the page correctly.
    var families = [];
    [fonts.headingGoogle, fonts.bodyGoogle].forEach(function (family) {
      if (isFilled(family) && families.indexOf(family) === -1 && /^[\w \-:;@,.]+$/.test(family)) {
        families.push(family);
      }
    });
    if (!families.length) return;

    var href = 'https://fonts.googleapis.com/css2?'
             + families.map(function (f) { return 'family=' + encodeURIComponent(f); }).join('&')
             + '&display=swap';

    var preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://fonts.gstatic.com';
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);

    var sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = href;
    document.head.appendChild(sheet);
  }

  // ---- 3. Logo -------------------------------------------------------------
  function applyLogo(logo) {
    if (!isObject(logo)) return;
    var emblem = find('.masthead .emblem');
    if (!emblem) return;

    if (logo.show === false) { emblem.remove(); return; }

    var size = parseInt(logo.size, 10);
    if (!isFinite(size) || size < 32 || size > 160) size = 68;

    var src = safeImage(logo.src);
    if (src) {
      var image = document.createElement('img');
      image.className = 'emblem';
      image.src = src;
      image.alt = isFilled(logo.alt) ? logo.alt : 'Club emblem';
      image.width = size;
      image.height = size;
      image.style.width = size + 'px';
      image.style.height = size + 'px';
      image.style.objectFit = logo.fit === 'contain' ? 'contain' : 'cover';
      if (logo.shape === 'circle') image.style.borderRadius = '50%';
      if (logo.shape === 'rounded') image.style.borderRadius = '10px';
      emblem.parentNode.replaceChild(image, emblem);
    } else {
      emblem.style.width = size + 'px';
      emblem.style.height = size + 'px';
    }

    // The tab icon, when the administrator has chosen one.
    var favicon = safeImage(logo.favicon || logo.src);
    if (favicon && logo.useAsFavicon !== false) {
      each(document.querySelectorAll('link[rel~="icon"]'), function (node) { node.remove(); });
      var icon = document.createElement('link');
      icon.rel = 'icon';
      icon.href = favicon;
      document.head.appendChild(icon);
    }
  }

  // ---- 4. Header -----------------------------------------------------------
  function applyHeader(header) {
    if (!isObject(header)) return;

    var topbar = find('.topbar');
    if (topbar) {
      if (header.showTopStrip === false) {
        topbar.remove();
      } else {
        var first = topbar.querySelector('.wrap > span');
        if (first && isFilled(header.topStripText)) first.textContent = header.topStripText;
        if (header.showAppearanceButtons === false) {
          each(topbar.querySelectorAll('[data-appearance]'), function (b) { b.remove(); });
        }
        if (header.showStaffLinks === false) {
          each(topbar.querySelectorAll('.staff'), function (a) { a.remove(); });
        }
      }
    }

    var contact = find('.masthead .contact-block');
    if (contact && header.showContact === false) contact.remove();

    var nav = find('.mainnav');
    if (nav) {
      if (header.stickyNav === false) rule('.mainnav { position: static; }');

      if (Array.isArray(header.navLinks) && header.navLinks.length) {
        var wrap = nav.querySelector('.wrap');
        // Which page is open now, so the same entry stays marked.
        var current = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
        wrap.textContent = '';
        header.navLinks.forEach(function (item) {
          if (!isObject(item) || !isFilled(item.label)) return;
          var a = link(item.label, item.href, 'index.html');
          var target = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
          if (target === current || (current === '' && target === 'index.html')) {
            a.className = 'active';
            a.setAttribute('aria-current', 'page');
          }
          wrap.appendChild(a);
        });
      }
    }

    var ticker = find('.ticker');
    if (ticker && header.showTicker === false) ticker.remove();
  }

  // ---- 5. Banners ----------------------------------------------------------
  // The home page slider is rebuilt from the administrator's list. site.js
  // starts it afterwards, so it gets the arrows, dots and timing for free.
  function applyBanners(banners, options) {
    var slider = find('[data-slider]');
    if (!slider || !Array.isArray(banners) || !banners.length) return;
    options = isObject(options) ? options : {};

    var height = parseInt(options.height, 10);
    if (isFinite(height) && height >= 200 && height <= 800) {
      rule('.slide { min-height: ' + height + 'px; }');
      rule('@media (max-width: 720px) { .slide { min-height: ' + Math.max(240, Math.round(height * 0.68)) + 'px; } }');
    }

    slider.textContent = '';
    var shown = 0;

    banners.forEach(function (banner) {
      if (!isObject(banner)) return;
      var hasText = isFilled(banner.title) || isFilled(banner.text);
      var image = safeImage(banner.image);
      if (!hasText && !image) return;

      var slide = document.createElement('div');
      slide.className = 'slide' + (shown === 0 ? ' on' : '');
      if (image) slide.style.backgroundImage = cssUrl(image);

      // How strongly the picture is darkened, so white text stays readable.
      var overlay = parseFloat(banner.overlay);
      if (!isFinite(overlay) || overlay < 0 || overlay > 1) overlay = 0.78;
      slide.style.setProperty('--overlay', String(overlay));
      if (banner.align === 'center') slide.setAttribute('data-align', 'center');

      var wrap = document.createElement('div');
      wrap.className = 'wrap';

      if (isFilled(banner.eyebrow)) {
        var eyebrow = document.createElement('span');
        eyebrow.className = 'eyebrow';
        eyebrow.textContent = banner.eyebrow;
        wrap.appendChild(eyebrow);
      }
      if (isFilled(banner.title)) {
        var heading = document.createElement('h2');
        heading.textContent = banner.title;
        wrap.appendChild(heading);
      }
      if (isFilled(banner.text)) {
        var body = document.createElement('p');
        body.textContent = banner.text;
        wrap.appendChild(body);
      }

      var buttons = [
        { data: banner.primary, className: 'btn btn-gold' },
        { data: banner.secondary, className: 'btn btn-outline' }
      ].filter(function (b) { return isObject(b.data) && isFilled(b.data.label); });

      if (buttons.length) {
        var actions = document.createElement('div');
        actions.className = 'slide-actions';
        buttons.forEach(function (b) {
          var a = link(b.data.label, b.data.href, 'index.html');
          a.className = b.className;
          actions.appendChild(a);
        });
        wrap.appendChild(actions);
      }

      slide.appendChild(wrap);
      slider.appendChild(slide);
      shown++;
    });

    if (!shown) return;

    rule('.slide::after { background: linear-gradient(90deg,'
       + ' rgba(7,26,51, calc(var(--overlay, .78) * 1.15)) 0%,'
       + ' rgba(7,26,51, calc(var(--overlay, .78) * 0.9)) 60%,'
       + ' rgba(7,26,51, calc(var(--overlay, .78) * 0.6)) 100%); }');
    rule('.slide[data-align="center"] .wrap { text-align: center; }');
    rule('.slide[data-align="center"] h2, .slide[data-align="center"] p { margin-inline: auto; }');
    rule('.slide[data-align="center"] .slide-actions { justify-content: center; }');

    if (shown > 1 && options.showArrows !== false) {
      ['prev', 'next'].forEach(function (which) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'slider-arrow ' + which;
        button.setAttribute('aria-label', which === 'prev' ? 'Previous slide' : 'Next slide');
        button.textContent = which === 'prev' ? '\u2039' : '\u203A';
        slider.appendChild(button);
      });
    }
    if (shown > 1 && options.showDots !== false) {
      var dots = document.createElement('div');
      dots.className = 'slider-dots';
      for (var i = 0; i < shown; i++) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-current', String(i === 0));
        dot.setAttribute('aria-label', 'Slide ' + (i + 1));
        dots.appendChild(dot);
      }
      slider.appendChild(dots);
    }

    // site.js reads these when it starts the slider.
    if (options.autoplay === false) slider.setAttribute('data-autoplay', 'off');
    var interval = parseInt(options.interval, 10);
    if (isFinite(interval) && interval >= 2000 && interval <= 30000) {
      slider.setAttribute('data-interval', String(interval));
    }
  }

  // ---- 6. Photographs ------------------------------------------------------
  // The gallery page shows every picture; the home page shows the first few.
  function applyPictures(pictures) {
    if (!Array.isArray(pictures) || !pictures.length) return;
    var grids = document.querySelectorAll('.gallery');
    if (!grids.length) return;

    each(grids, function (grid) {
      var limit = parseInt(grid.getAttribute('data-gallery-limit'), 10);
      if (!isFinite(limit)) limit = grid.querySelectorAll('figure').length || pictures.length;
      var chosen = pictures.slice(0, Math.max(limit, 1));

      grid.textContent = '';
      chosen.forEach(function (picture) {
        if (!isObject(picture)) return;
        var src = safeImage(picture.src);
        if (!src) return;
        var caption = isFilled(picture.caption) ? picture.caption : '';

        var figure = document.createElement('figure');
        if (isFilled(picture.category)) figure.setAttribute('data-category', picture.category);
        figure.setAttribute('data-caption', isFilled(picture.description) ? picture.description : caption);

        var button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', 'View: ' + (caption || 'photograph'));

        var image = document.createElement('img');
        image.src = src;
        image.alt = caption;
        image.loading = 'lazy';
        button.appendChild(image);

        figure.appendChild(button);
        if (caption) {
          var figcaption = document.createElement('figcaption');
          figcaption.textContent = caption;
          figure.appendChild(figcaption);
        }
        grid.appendChild(figure);
      });
    });

    // Keep the category filter buttons in step with the categories in use.
    var group = find('[data-filter-group]');
    if (group) {
      var categories = [];
      pictures.forEach(function (p) {
        if (isObject(p) && isFilled(p.category) && categories.indexOf(p.category) === -1) {
          categories.push(p.category);
        }
      });
      if (categories.length) {
        group.textContent = '';
        var all = document.createElement('button');
        all.type = 'button';
        all.setAttribute('data-filter', 'all');
        all.setAttribute('aria-pressed', 'true');
        all.textContent = 'All';
        group.appendChild(all);
        categories.forEach(function (category) {
          var button = document.createElement('button');
          button.type = 'button';
          button.setAttribute('data-filter', category);
          button.setAttribute('aria-pressed', 'false');
          button.textContent = category;
          group.appendChild(button);
        });
      }
    }
  }

  // ---- 7. Footer -----------------------------------------------------------
  function applyFooter(footer) {
    if (!isObject(footer)) return;
    var element = find('.site-footer');
    if (!element) return;

    if (isFilled(footer.about)) {
      var first = element.querySelector('.footer-grid > div');
      if (first) {
        var paragraph = first.querySelector('p:last-of-type');
        if (paragraph) paragraph.textContent = footer.about;
      }
    }

    if (Array.isArray(footer.columns) && footer.columns.length) {
      var grid = element.querySelector('.footer-grid');
      var keep = grid.children[0];                  // the club identity column
      var office = grid.children[2];                // address, telephone, e-mail
      grid.textContent = '';
      if (keep) grid.appendChild(keep);

      footer.columns.forEach(function (column) {
        if (!isObject(column) || !isFilled(column.title)) return;
        var box = document.createElement('div');
        var title = document.createElement('h3');
        title.textContent = column.title;
        box.appendChild(title);

        var list = document.createElement('ul');
        (Array.isArray(column.links) ? column.links : []).forEach(function (item) {
          if (!isObject(item) || !isFilled(item.label)) return;
          var li = document.createElement('li');
          li.appendChild(link(item.label, item.href, 'index.html'));
          list.appendChild(li);
        });
        box.appendChild(list);
        grid.appendChild(box);
      });

      if (office && footer.keepOfficeColumn !== false) grid.appendChild(office);
    }

    var bar = element.querySelector('.footer-bar');
    if (bar && isFilled(footer.copyright)) {
      var text = bar.querySelector('span');
      if (text) text.textContent = footer.copyright;
    }
    if (bar && footer.showStaffLinks === false) {
      each(bar.querySelectorAll('a'), function (a) {
        var href = a.getAttribute('href') || '';
        if (href.indexOf('adminpanel') !== -1) a.remove();
      });
      each(element.querySelectorAll('.footer-grid a'), function (a) {
        var href = a.getAttribute('href') || '';
        if (href.indexOf('adminpanel') !== -1) a.closest('li').remove();
      });
    }
  }

  // ---- 8. The name, everywhere it is written ------------------------------
  // site.js fills [data-content] nodes. The page title and the sharing tags
  // sit outside that, so they are handled here.
  function applyName(content) {
    if (!isFilled(content.orgName)) return;
    var name = content.orgName;

    if (document.title) {
      var parts = document.title.split(/\s+[—–-]\s+/);
      document.title = parts.length > 1 ? parts[0] + ' — ' + name : name;
    }
    each(document.querySelectorAll('meta[property="og:site_name"], meta[name="author"]'), function (meta) {
      meta.setAttribute('content', name);
    });
  }

  // ---- Run -----------------------------------------------------------------
  applyColours(C.theme);
  applyFonts(C.fonts);
  applyLogo(C.logo);
  applyHeader(C.header);
  applyBanners(C.banners, C.bannerSettings);
  applyPictures(C.pictures);
  applyFooter(C.footer);
  applyName(C);

  if (extraCss.length) {
    var style = document.createElement('style');
    style.setAttribute('data-club-theme', '');
    style.textContent = extraCss.join('\n');
    document.head.appendChild(style);
  }

  // A preview is not the published site. Say so plainly, so nobody reports a
  // change as live when it is still only a draft in this browser.
  if (C.__preview) {
    var strip = document.createElement('div');
    strip.setAttribute('role', 'status');
    strip.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:400;background:#8c2f39;'
      + 'color:#fff;font:600 13px/1.5 system-ui,sans-serif;padding:9px 16px;text-align:center';
    strip.textContent = 'Preview — these changes are only in this browser. Publish them from the Admin Panel to put them on the website.';
    (document.body || document.documentElement).appendChild(strip);
  }
})();
