/* ---------------------------------------------------------------------------
   panel-core.js — the Admin and Super Admin consoles.

   One engine, two panels. The Super Admin Panel is the Admin Panel plus the
   sections only a secretary should reach: administrators, passwords, backups,
   the activity log and the server lock.

   The panels never write to your website. They prepare files — content.js, and
   for the Super Admin panel-auth.js and .htaccess — which you upload to your
   host. That is the whole publishing step, and the docket along the bottom of
   the screen always says what is still waiting to go.

   Written in plain ES5 for the same reason as the rest of this project: it has
   to run from a folder copied onto ordinary shared hosting, with no build step.
   --------------------------------------------------------------------------- */

window.ClubPanel = (function () {
  'use strict';

  var DRAFT_KEY = 'club-panel-draft';
  var PUBLISHED_KEY = 'club-panel-published';
  var LOG_KEY = 'club-panel-log';
  var SESSION_KEY = 'club-panel-session';
  var ATTEMPT_KEY = 'club-panel-attempts';

  // =========================================================================
  // 1. Hashing — SHA-256, HMAC, PBKDF2 and SHA-1, all in plain JavaScript.
  //    A browser served over https can do this in hardware; over plain http
  //    crypto.subtle is not available at all, so the same work is done here.
  // =========================================================================

  var K256 = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];

  function sha256(bytes) {
    var h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var len = bytes.length;
    var padded = new Uint8Array((((len + 8) >> 6) + 1) * 64);
    padded.set(bytes);
    padded[len] = 0x80;
    var bits = len * 8;
    var view = new DataView(padded.buffer);
    view.setUint32(padded.length - 4, bits >>> 0, false);
    view.setUint32(padded.length - 8, Math.floor(bits / 4294967296), false);

    var w = new Int32Array(64), i, offset;
    for (offset = 0; offset < padded.length; offset += 64) {
      for (i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4, false);
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K256[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = new Uint8Array(32), ov = new DataView(out.buffer);
    for (i = 0; i < 8; i++) ov.setInt32(i * 4, h[i], false);
    return out;
  }

  function hmacSha256(key, message) {
    var block = new Uint8Array(64);
    if (key.length > 64) block.set(sha256(key)); else block.set(key);
    var inner = new Uint8Array(64), outer = new Uint8Array(64), i;
    for (i = 0; i < 64; i++) { inner[i] = block[i] ^ 0x36; outer[i] = block[i] ^ 0x5c; }
    var first = new Uint8Array(64 + message.length);
    first.set(inner); first.set(message, 64);
    var digest = sha256(first);
    var second = new Uint8Array(96);
    second.set(outer); second.set(digest, 64);
    return sha256(second);
  }

  function pbkdf2Js(password, salt, iterations, length) {
    var out = new Uint8Array(length);
    var blocks = Math.ceil(length / 32);
    for (var block = 1; block <= blocks; block++) {
      var seed = new Uint8Array(salt.length + 4);
      seed.set(salt);
      seed[salt.length]     = (block >>> 24) & 0xff;
      seed[salt.length + 1] = (block >>> 16) & 0xff;
      seed[salt.length + 2] = (block >>> 8) & 0xff;
      seed[salt.length + 3] = block & 0xff;
      var u = hmacSha256(password, seed);
      var acc = u.slice();
      for (var i = 1; i < iterations; i++) {
        u = hmacSha256(password, u);
        for (var j = 0; j < 32; j++) acc[j] ^= u[j];
      }
      out.set(acc.subarray(0, Math.min(32, length - (block - 1) * 32)), (block - 1) * 32);
    }
    return out;
  }

  /* Apache accepts {SHA} lines in a .htpasswd file, which is what the server
     lock generator writes. Only needed there. */
  function sha1(bytes) {
    var h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    var len = bytes.length;
    var padded = new Uint8Array((((len + 8) >> 6) + 1) * 64);
    padded.set(bytes);
    padded[len] = 0x80;
    var view = new DataView(padded.buffer);
    view.setUint32(padded.length - 4, (len * 8) >>> 0, false);
    view.setUint32(padded.length - 8, Math.floor(len * 8 / 4294967296), false);

    var w = new Int32Array(80), i, offset;
    for (offset = 0; offset < padded.length; offset += 64) {
      for (i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4, false);
      for (i = 16; i < 80; i++) {
        var v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
        w[i] = (v << 1) | (v >>> 31);
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
      for (i = 0; i < 80; i++) {
        var f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        var temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
        e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = temp;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0;
      h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0;
    }
    var out = new Uint8Array(20), ov = new DataView(out.buffer);
    for (i = 0; i < 5; i++) ov.setInt32(i * 4, h[i], false);
    return out;
  }

  function utf8(text) {
    if (window.TextEncoder) return new TextEncoder().encode(text);
    var encoded = unescape(encodeURIComponent(text));
    var bytes = new Uint8Array(encoded.length);
    for (var i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i) & 0xff;
    return bytes;
  }

  function toHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
  }

  function toBase64(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
  }

  /* Uses the browser's own implementation when it is available, which needs
     an https page, and falls back to the code above when it is not. Both give
     the same answer for the same password. */
  function derive(password, salt, iterations) {
    var subtle = window.crypto && window.crypto.subtle;
    if (subtle && window.isSecureContext) {
      return subtle.importKey('raw', utf8(password), { name: 'PBKDF2' }, false, ['deriveBits'])
        .then(function (key) {
          return subtle.deriveBits(
            { name: 'PBKDF2', salt: utf8(salt), iterations: iterations, hash: 'SHA-256' },
            key, 256
          );
        })
        .then(function (bits) { return toHex(new Uint8Array(bits)); })
        .catch(function () { return toHex(pbkdf2Js(utf8(password), utf8(salt), iterations, 32)); });
    }
    return new Promise(function (resolve) {
      // Let the browser paint "Checking…" before the work begins.
      setTimeout(function () {
        resolve(toHex(pbkdf2Js(utf8(password), utf8(salt), iterations, 32)));
      }, 20);
    });
  }

  /* Compared without stopping at the first wrong character. */
  function sameHash(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function randomSalt(prefix) {
    var bytes = new Uint8Array(9);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 9; i++) bytes[i] = Math.floor(Math.random() * 256);
    return prefix + '.' + toHex(bytes);
  }

  // =========================================================================
  // 2. Small helpers
  // =========================================================================

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;      // only ever with our own strings
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, value);
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function byId(id) { return document.getElementById(id); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function bytesOf(text) {
    if (window.Blob) return new Blob([text]).size;
    return utf8(text).length;
  }

  function readableSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = el('a', { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  var toastTimer = null;
  function toast(message, kind) {
    var existing = byId('toast');
    if (existing) existing.remove();
    var node = el('div', { id: 'toast', class: 'toast' + (kind ? ' ' + kind : ''), role: 'status', text: message });
    document.body.appendChild(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (node.parentNode) node.remove(); }, 3600);
  }

  // =========================================================================
  // 3. Catalogues
  // =========================================================================

  var FONTS = [
    { label: 'Georgia — the site as built', stack: 'Georgia, "Noto Serif", "Times New Roman", serif', google: '' },
    { label: 'System sans — fastest, no download', stack: '"Segoe UI", system-ui, -apple-system, "Noto Sans", Arial, sans-serif', google: '' },
    { label: 'Times New Roman', stack: '"Times New Roman", Times, serif', google: '' },
    { label: 'Playfair Display — formal, high contrast', stack: '"Playfair Display", Georgia, serif', google: 'Playfair Display:wght@500;600;700' },
    { label: 'Merriweather — sturdy on screen', stack: 'Merriweather, Georgia, serif', google: 'Merriweather:wght@400;700' },
    { label: 'Lora — warm serif', stack: 'Lora, Georgia, serif', google: 'Lora:wght@400;600;700' },
    { label: 'Source Serif 4', stack: '"Source Serif 4", Georgia, serif', google: 'Source Serif 4:wght@400;600;700' },
    { label: 'Libre Baskerville — bookish', stack: '"Libre Baskerville", Georgia, serif', google: 'Libre Baskerville:wght@400;700' },
    { label: 'Noto Serif Bengali — বাংলা', stack: '"Noto Serif Bengali", Georgia, serif', google: 'Noto Serif Bengali:wght@400;600;700' },
    { label: 'Inter — plain and modern', stack: 'Inter, "Segoe UI", system-ui, sans-serif', google: 'Inter:wght@400;500;600;700' },
    { label: 'Source Sans 3', stack: '"Source Sans 3", "Segoe UI", system-ui, sans-serif', google: 'Source Sans 3:wght@400;600;700' },
    { label: 'IBM Plex Sans — technical', stack: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif', google: 'IBM Plex Sans:wght@400;500;600;700' },
    { label: 'Work Sans', stack: '"Work Sans", "Segoe UI", system-ui, sans-serif', google: 'Work Sans:wght@400;500;600;700' },
    { label: 'Open Sans', stack: '"Open Sans", "Segoe UI", system-ui, sans-serif', google: 'Open Sans:wght@400;600;700' },
    { label: 'Hind Siliguri — বাংলা', stack: '"Hind Siliguri", "Segoe UI", system-ui, sans-serif', google: 'Hind Siliguri:wght@400;500;600;700' },
    { label: 'Noto Sans Bengali — বাংলা', stack: '"Noto Sans Bengali", "Segoe UI", system-ui, sans-serif', google: 'Noto Sans Bengali:wght@400;600;700' },
    { label: 'Mukta — Indic and Latin', stack: 'Mukta, "Segoe UI", system-ui, sans-serif', google: 'Mukta:wght@400;600;700' }
  ];

  var PALETTES = [
    { name: 'Navy and gold', colours: { primary: '#0b2545', primaryLight: '#123a63', accent: '#c8961e', accentSoft: '#f0cf7d', page: '#f2f5f9', surface: '#ffffff', ink: '#16202b', line: '#d3dbe5' } },
    { name: 'Forest and brass', colours: { primary: '#12331f', primaryLight: '#1d5334', accent: '#b98b2c', accentSoft: '#e8cb8a', page: '#f2f6f2', surface: '#ffffff', ink: '#16231a', line: '#cfdcd2' } },
    { name: 'Maroon and cream', colours: { primary: '#4a121c', primaryLight: '#7a2230', accent: '#c9a227', accentSoft: '#eed98c', page: '#f7f3ee', surface: '#ffffff', ink: '#241419', line: '#e0d3ca' } },
    { name: 'Indigo and saffron', colours: { primary: '#1b1f4b', primaryLight: '#2f3675', accent: '#e08b1e', accentSoft: '#f3c37f', page: '#f4f4fa', surface: '#ffffff', ink: '#191a2c', line: '#d5d6e6' } },
    { name: 'Teal and sand', colours: { primary: '#0d3b40', primaryLight: '#15616a', accent: '#c98b3a', accentSoft: '#eec596', page: '#f1f6f6', surface: '#ffffff', ink: '#12262a', line: '#cddedd' } },
    { name: 'Slate and rust', colours: { primary: '#232b33', primaryLight: '#3b4855', accent: '#b5562b', accentSoft: '#e5a181', page: '#f4f5f6', surface: '#ffffff', ink: '#1a1f24', line: '#d6dade' } }
  ];

  var COLOUR_FIELDS = [
    { key: 'primary', label: 'Header background' },
    { key: 'primaryLight', label: 'Navigation bar' },
    { key: 'accent', label: 'Accent (buttons, rules)' },
    { key: 'accentSoft', label: 'Accent, lighter' },
    { key: 'page', label: 'Page background' },
    { key: 'surface', label: 'Cards and panels' },
    { key: 'ink', label: 'Body text' },
    { key: 'line', label: 'Borders' }
  ];

  var PAGES = ['index.html', 'about.html', 'committee.html', 'members.html', 'events.html',
               'news.html', 'notices.html', 'gallery.html', 'downloads.html', 'membership.html',
               'contact.html'];

  // =========================================================================
  // 4. What a brand-new site starts from
  // =========================================================================

  var DEFAULTS = {
    orgName: 'Krishnanagar Youth & Cultural Club',
    shortName: 'KYCC',
    tagline: 'Service · Culture · Community · Established 1978',
    established: '1978',
    registration: 'Registered under the West Bengal Societies Registration Act — Reg. No. S/1L/12345 of 1978-79',
    address: 'Community Hall, 14 Rabindra Sarani\nWard No. 12, Krishnanagar\nNadia, West Bengal — 741101',
    phone: '+91 33 2555 0100',
    email: 'office@example.org',
    hours: 'Monday to Saturday, 10:00 AM – 5:00 PM (closed on public holidays)',
    hoursShort: 'Monday to Saturday, 10:00 AM – 5:00 PM',

    notices: [
      { text: 'Annual General Meeting — 12 September 2026, 11:00 AM at the club hall', href: 'notices.html' },
      { text: 'Membership renewal for 2026-27 is open until 30 September', href: 'membership.html' },
      { text: 'Blood donation camp: registrations close on 5 September', href: 'events.html' }
    ],

    logo: { src: '', alt: 'Club emblem', size: 68, shape: 'circle', fit: 'cover', show: true, useAsFavicon: true },

    banners: [
      {
        image: '', eyebrow: 'Established 1978 · Registered Society',
        title: 'Serving the ward for forty-seven years',
        text: 'A registered community organisation working in social service, sport, culture, education and public health. Membership is open to every resident of the ward.',
        overlay: 0.78, align: 'left',
        primary: { label: 'Become a member', href: 'membership.html' },
        secondary: { label: 'About the club', href: 'about.html' }
      },
      {
        image: '', eyebrow: 'Programmes',
        title: 'Annual Cultural Festival 2026',
        text: 'Three evenings of music, recitation and drama presented by members of every age, closing with the prize distribution ceremony on 23 September.',
        overlay: 0.78, align: 'left',
        primary: { label: 'See the calendar', href: 'events.html' },
        secondary: { label: 'Photographs', href: 'gallery.html' }
      },
      {
        image: '', eyebrow: 'Public service',
        title: 'Blood donation camp, 7 September',
        text: 'Held with the district blood bank at the community hall. Donors should carry a photo identity card and eat before arriving.',
        overlay: 0.78, align: 'left',
        primary: { label: 'Register at the office', href: 'events.html' },
        secondary: { label: 'Ask a question', href: 'contact.html' }
      }
    ],
    bannerSettings: { autoplay: true, interval: 6000, height: 360, showDots: true, showArrows: true },

    fonts: {
      headingFamily: 'Georgia, "Noto Serif", "Times New Roman", serif', headingGoogle: '',
      bodyFamily: '"Segoe UI", system-ui, -apple-system, "Noto Sans", Arial, sans-serif', bodyGoogle: '',
      scale: 100, headingWeight: 700, headingSpacing: 0
    },

    theme: clone(PALETTES[0].colours),

    header: {
      topStripText: 'Government of West Bengal · Registered Society',
      showTopStrip: true, showAppearanceButtons: true, showStaffLinks: true,
      showContact: true, showTicker: true, stickyNav: true,
      navLinks: [
        { label: 'Home', href: 'index.html' },
        { label: 'About Us', href: 'about.html' },
        { label: 'Committee', href: 'committee.html' },
        { label: 'Members', href: 'members.html' },
        { label: 'Events', href: 'events.html' },
        { label: 'News', href: 'news.html' },
        { label: 'Notice Board', href: 'notices.html' },
        { label: 'Gallery', href: 'gallery.html' },
        { label: 'Downloads', href: 'downloads.html' },
        { label: 'Membership', href: 'membership.html' },
        { label: 'Contact', href: 'contact.html' }
      ]
    },

    footer: {
      about: '', copyright: '', showStaffLinks: true, keepOfficeColumn: true,
      columns: [
        {
          title: 'Quick links',
          links: [
            { label: 'About Us', href: 'about.html' },
            { label: 'Committee', href: 'committee.html' },
            { label: 'Members', href: 'members.html' },
            { label: 'Events', href: 'events.html' },
            { label: 'News', href: 'news.html' },
            { label: 'Notice Board', href: 'notices.html' }
          ]
        }
      ]
    },

    pictures: []
  };

  // =========================================================================
  // 5. State
  // =========================================================================

  var role = 'admin';
  var account = null;
  var draft = null;
  var storageBlocked = false;
  var currentSection = 'overview';
  var idleTimer = null;

  function auth() {
    return window.CLUB_PANEL_AUTH || { version: 0, iterations: 100000, accounts: [], idleMinutes: 30 };
  }

  function loadDraft() {
    try {
      var raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        // Anything the saved draft does not mention keeps its starting value,
        // so an older draft still works after the panel gains a new setting.
        return mergeInto(clone(DEFAULTS), saved);
      }
    } catch (e) { /* first visit, or storage unavailable */ }
    return clone(DEFAULTS);
  }

  function mergeInto(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    Object.keys(extra).forEach(function (key) {
      var value = extra[key];
      if (value === null || value === undefined) return;
      if (Array.isArray(value)) base[key] = clone(value);
      else if (typeof value === 'object') base[key] = mergeInto(base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]) ? base[key] : {}, value);
      else base[key] = value;
    });
    return base;
  }

  function saveDraft() {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      storageBlocked = false;
    } catch (e) {
      // Pictures are large. When the browser's store is full the draft cannot
      // be kept between visits — say so rather than losing work silently.
      storageBlocked = true;
    }
    refreshDocket();
  }

  function publishedFingerprint() {
    try { return window.localStorage.getItem(PUBLISHED_KEY) || ''; } catch (e) { return ''; }
  }

  function fingerprint(value) {
    var text = JSON.stringify(value);
    return toHex(sha256(utf8(text))).slice(0, 32);
  }

  function logEntry(what) {
    try {
      var list = JSON.parse(window.localStorage.getItem(LOG_KEY) || '[]');
      list.unshift({ at: new Date().toISOString(), who: account ? account.name : 'Unknown', what: what });
      window.localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, 120)));
    } catch (e) { /* nothing to record into */ }
  }

  function readLog() {
    try { return JSON.parse(window.localStorage.getItem(LOG_KEY) || '[]'); } catch (e) { return []; }
  }

  // =========================================================================
  // 6. The file that gets published
  // =========================================================================

  function published() {
    var out = clone(draft);
    delete out.__preview;
    out._meta = {
      generated: new Date().toISOString(),
      by: account ? account.name : 'Administrator',
      panel: role === 'super' ? 'Super Admin Panel' : 'Admin Panel'
    };
    return out;
  }

  function contentFile() {
    var data = published();
    return '/* -----------------------------------------------------------------\n'
         + '   content.js — the settings for this website.\n\n'
         + '   Written by the ' + data._meta.panel + ' on ' + new Date().toLocaleString() + '.\n'
         + '   Upload this file to  assets/js/content.js  on your web host,\n'
         + '   replacing the one already there. Every page picks it up at once.\n'
         + '   ----------------------------------------------------------------- */\n\n'
         + 'window.CLUB_CONTENT = ' + JSON.stringify(data, null, 2) + ';\n';
  }

  function pictureBytes() {
    var total = 0;
    function add(value) { if (typeof value === 'string' && value.slice(0, 5) === 'data:') total += value.length; }
    add(draft.logo && draft.logo.src);
    (draft.banners || []).forEach(function (b) { add(b.image); });
    (draft.pictures || []).forEach(function (p) { add(p.src); });
    return total;
  }

  // =========================================================================
  // 7. Pictures chosen from the computer
  // =========================================================================

  var PRESETS = {
    banner:  { width: 1600, height: 900, quality: 0.82, label: 'banner' },
    logo:    { width: 512, height: 512, quality: 0.92, label: 'logo' },
    picture: { width: 1280, height: 960, quality: 0.8, label: 'photograph' }
  };

  /* Full-size photographs from a phone are several megabytes each, and every
     one of them would end up inside content.js. They are scaled down here to
     the largest size the page can actually show. */
  function importPicture(file, presetName) {
    var preset = PRESETS[presetName] || PRESETS.picture;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) {
        reject(new Error('That is not a picture. Choose a JPG, PNG, WEBP, GIF or SVG file.'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('That file could not be read.')); };
      reader.onload = function () {
        var dataUrl = String(reader.result);

        // A drawing keeps its own file: it is small already and stays sharp.
        if (file.type === 'image/svg+xml') {
          resolve({ src: dataUrl, bytes: dataUrl.length, name: file.name, note: 'kept as SVG' });
          return;
        }

        var image = new Image();
        image.onerror = function () { reject(new Error('That picture could not be opened.')); };
        image.onload = function () {
          var scale = Math.min(preset.width / image.width, preset.height / image.height, 1);
          var width = Math.max(1, Math.round(image.width * scale));
          var height = Math.max(1, Math.round(image.height * scale));

          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          var context = canvas.getContext('2d');

          // A logo may be transparent; JPEG cannot hold that, so keep PNG.
          var keepAlpha = presetName === 'logo' && (file.type === 'image/png' || file.type === 'image/webp');
          if (!keepAlpha) {
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, width, height);
          }
          context.drawImage(image, 0, 0, width, height);

          var out = keepAlpha ? canvas.toDataURL('image/png')
                              : canvas.toDataURL('image/jpeg', preset.quality);
          resolve({
            src: out, bytes: out.length, name: file.name,
            note: width + '×' + height + (scale < 1 ? ', scaled down' : '')
          });
        };
        image.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  /* A file chooser that also accepts a picture dragged onto it. */
  function picker(options) {
    var input = el('input', {
      type: 'file', accept: 'image/*', hidden: true,
      multiple: options.multiple ? true : false
    });
    var box = el('div', { class: 'drop', tabindex: '0', role: 'button' }, [
      el('div', { class: 'big', text: '🖼' }),
      el('div', { class: 'label', text: options.label || 'Choose a picture' }),
      el('div', { class: 'sub', text: options.sub || 'or drag one here — JPG, PNG, WEBP or SVG' })
    ]);

    function take(files) {
      var list = Array.prototype.slice.call(files || []);
      if (!list.length) return;
      box.querySelector('.label').textContent = 'Working…';
      var jobs = list.map(function (file) { return importPicture(file, options.preset); });
      Promise.all(jobs).then(function (results) {
        box.querySelector('.label').textContent = options.label || 'Choose a picture';
        options.onPicked(options.multiple ? results : results[0]);
      }).catch(function (error) {
        box.querySelector('.label').textContent = options.label || 'Choose a picture';
        toast(error.message, 'bad');
      });
    }

    input.addEventListener('change', function () { take(input.files); input.value = ''; });
    box.addEventListener('click', function () { input.click(); });
    box.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (name) {
      box.addEventListener(name, function (event) { event.preventDefault(); box.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      box.addEventListener(name, function (event) { event.preventDefault(); box.classList.remove('over'); });
    });
    box.addEventListener('drop', function (event) {
      if (event.dataTransfer && event.dataTransfer.files) take(event.dataTransfer.files);
    });

    return el('div', {}, [box, input]);
  }

  // =========================================================================
  // 8. Field builders
  // =========================================================================

  function textField(options) {
    var input = el(options.rows ? 'textarea' : 'input', {
      id: options.id, type: options.type || 'text',
      value: options.rows ? null : (options.value || ''),
      rows: options.rows || null,
      placeholder: options.placeholder || null
    });
    if (options.rows) input.value = options.value || '';
    input.addEventListener('input', function () { options.onChange(input.value); });
    return el('div', { class: 'field' }, [
      options.label ? el('label', { for: options.id, text: options.label }) : null,
      input,
      options.hint ? el('div', { class: 'hint', text: options.hint }) : null
    ]);
  }

  function checkField(options) {
    var input = el('input', { type: 'checkbox' });
    input.checked = options.value !== false;
    input.addEventListener('change', function () { options.onChange(input.checked); });
    return el('label', { class: 'inline' }, [input, options.label]);
  }

  function selectField(options) {
    var select = el('select', { id: options.id });
    options.options.forEach(function (item) {
      var option = el('option', { value: item.value, text: item.label });
      if (String(item.value) === String(options.value)) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', function () { options.onChange(select.value); });
    return el('div', { class: 'field' }, [
      options.label ? el('label', { for: options.id, text: options.label }) : null,
      select,
      options.hint ? el('div', { class: 'hint', text: options.hint }) : null
    ]);
  }

  function rangeField(options) {
    var input = el('input', {
      type: 'range', min: options.min, max: options.max,
      step: options.step || 1, value: options.value
    });
    var readout = el('output', { text: options.format(options.value) });
    input.addEventListener('input', function () {
      readout.textContent = options.format(input.value);
      options.onChange(input.value);
    });
    return el('div', { class: 'field' }, [
      el('label', { text: options.label }),
      el('div', { class: 'range-row' }, [input, readout]),
      options.hint ? el('div', { class: 'hint', text: options.hint }) : null
    ]);
  }

  /* The header and controls shared by every repeating row. */
  function itemShell(options) {
    var head = el('div', { class: 'item-head' }, [
      el('span', { class: 'n', text: String(options.index + 1) }),
      el('span', { class: 'name', text: options.name || 'Untitled' }),
      el('div', { class: 'move' }, [
        el('button', {
          type: 'button', title: 'Move up', text: '↑', disabled: options.index === 0,
          onclick: function () { options.onMove(-1); }
        }),
        el('button', {
          type: 'button', title: 'Move down', text: '↓', disabled: options.index === options.total - 1,
          onclick: function () { options.onMove(1); }
        }),
        el('button', {
          type: 'button', class: 'remove', title: 'Remove', text: '×',
          onclick: function () {
            if (window.confirm('Remove "' + (options.name || 'this entry') + '"?')) options.onRemove();
          }
        })
      ])
    ]);
    return el('div', { class: 'item' }, [head, el('div', { class: 'body' }, options.children)]);
  }

  function move(list, index, by) {
    var target = index + by;
    if (target < 0 || target >= list.length) return;
    var item = list.splice(index, 1)[0];
    list.splice(target, 0, item);
  }

  // =========================================================================
  // 9. Sections
  // =========================================================================

  var SECTIONS = [];

  function section(id, label, group, icon, build, superOnly) {
    SECTIONS.push({ id: id, label: label, group: group, icon: icon, build: build, superOnly: !!superOnly });
  }

  function head(title, description) {
    return el('header', {}, [el('h2', { text: title }), el('p', { text: description })]);
  }

  function card(title, count, children) {
    return el('div', { class: 'card' }, [
      el('h3', {}, [title, count ? el('span', { class: 'count', text: count }) : null]),
      el('div', { class: 'body' }, children)
    ]);
  }

  // ---- Overview -----------------------------------------------------------
  section('overview', 'Overview', 'Website', '▦', function (stage) {
    var changes = fingerprint(published()) !== publishedFingerprint();
    var pictures = (draft.pictures || []).length;
    var banners = (draft.banners || []).length;

    stage.appendChild(head('Overview',
      'What this panel controls, and what is waiting to be published.'));

    if (storageBlocked) {
      stage.appendChild(el('div', { class: 'note stop' }, [
        el('strong', { text: 'This browser cannot keep your draft.' }),
        'Its storage is full — usually because of large pictures. Your work is still on screen, '
        + 'but it will be lost if you close the tab. Publish now, or remove a few pictures.'
      ]));
    }

    stage.appendChild(el('div', { class: 'note' + (changes ? ' warn' : ' ok') }, [
      el('strong', { text: changes ? 'You have changes that are not published yet.' : 'Everything here has been published.' }),
      changes
        ? 'Nothing reaches the website until you download content.js and upload it to your host. Open Publish when you are ready.'
        : 'The last file you downloaded matches what is on this screen.'
    ]));

    var rows = [
      ['Club name', draft.orgName],
      ['Banners on the home page', String(banners)],
      ['Photographs in the gallery', String(pictures)],
      ['Scrolling notices', String((draft.notices || []).length)],
      ['Menu entries', String(((draft.header || {}).navLinks || []).length)],
      ['Heading typeface', (draft.fonts || {}).headingFamily.split(',')[0].replace(/"/g, '')],
      ['Body typeface', (draft.fonts || {}).bodyFamily.split(',')[0].replace(/"/g, '')],
      ['Size of the file to upload', readableSize(bytesOf(contentFile()))]
    ];

    var table = el('table', {}, [
      el('tbody', {}, rows.map(function (row) {
        return el('tr', {}, [el('td', { text: row[0] }), el('td', { class: 'mono', text: row[1] })]);
      }))
    ]);
    stage.appendChild(card('This website at a glance', null, [table]));

    stage.appendChild(card('See it before you publish', null, [
      el('p', { text: 'Preview opens the website in a new tab with everything on this screen applied. '
                    + 'It is shown only in this browser — visitors still see the published site.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn btn-accent', type: 'button', text: '↗ Preview the website', onclick: openPreview }),
        el('a', { class: 'btn btn-quiet', href: '../../index.html', target: '_blank', text: 'Open the published site' })
      ])
    ]));
  });

  // ---- Name and logo ------------------------------------------------------
  section('identity', 'Name and logo', 'Website', '◈', function (stage) {
    stage.appendChild(head('Name and logo',
      'The club\'s name, the line under it, and the emblem in the header. These appear on every page.'));

    stage.appendChild(card('The club\'s name', null, [
      textField({ id: 'f-orgname', label: 'Full name', value: draft.orgName,
        hint: 'Shown in the header, the footer, the copyright line and the browser tab.',
        onChange: function (v) { draft.orgName = v; saveDraft(); } }),
      el('div', { class: 'two' }, [
        textField({ id: 'f-short', label: 'Short name or initials', value: draft.shortName,
          onChange: function (v) { draft.shortName = v; saveDraft(); } }),
        textField({ id: 'f-est', label: 'Established (year)', value: draft.established,
          onChange: function (v) { draft.established = v; saveDraft(); } })
      ]),
      textField({ id: 'f-tagline', label: 'Line under the name', value: draft.tagline,
        onChange: function (v) { draft.tagline = v; saveDraft(); } }),
      textField({ id: 'f-reg', label: 'Registration details', value: draft.registration, rows: 2,
        hint: 'Shown in the footer.',
        onChange: function (v) { draft.registration = v; saveDraft(); } })
    ]));

    var logo = draft.logo;
    var preview = el('div', { class: 'field' });

    function drawLogo() {
      clear(preview);
      if (logo.src) {
        preview.appendChild(el('label', { text: 'Current logo' }));
        var image = el('img', { src: logo.src, alt: '', class: 'thumb square' });
        image.style.objectFit = logo.fit === 'contain' ? 'contain' : 'cover';
        if (logo.shape === 'circle') image.style.borderRadius = '50%';
        if (logo.shape === 'rounded') image.style.borderRadius = '10px';
        preview.appendChild(image);
        preview.appendChild(el('div', { class: 'file-size' }, [
          readableSize(logo.src.length) + ' inside content.js',
          el('button', {
            class: 'btn btn-danger btn-sm', type: 'button', text: 'Remove',
            onclick: function () { logo.src = ''; saveDraft(); render(); }
          })
        ]));
      } else {
        preview.appendChild(el('div', { class: 'empty' }, [
          el('strong', { text: 'No logo chosen' }),
          'The emblem drawn into the pages is being used.'
        ]));
      }
    }
    drawLogo();

    stage.appendChild(card('Logo', null, [
      preview,
      picker({
        preset: 'logo', label: 'Choose a logo from your computer',
        sub: 'A square picture works best. PNG keeps a transparent background.',
        onPicked: function (result) {
          logo.src = result.src;
          saveDraft();
          logEntry('Changed the logo');
          toast('Logo added — ' + result.note, 'good');
          render();
        }
      }),
      el('div', { class: 'field', style: 'margin-top:14px' }, [
        textField({ id: 'f-logo-path', label: 'Or use a file already on your host', value: logo.src && logo.src.slice(0, 5) !== 'data:' ? logo.src : '',
          placeholder: 'assets/img/logo.png',
          hint: 'If you upload the picture yourself through cPanel, put its path here instead. That keeps content.js small.',
          onChange: function (v) { logo.src = v; saveDraft(); } })
      ]),
      el('div', { class: 'two' }, [
        selectField({ id: 'f-logo-shape', label: 'Shape', value: logo.shape,
          options: [{ value: 'circle', label: 'Circle' }, { value: 'rounded', label: 'Rounded square' }, { value: 'square', label: 'Square' }],
          onChange: function (v) { logo.shape = v; saveDraft(); render(); } }),
        selectField({ id: 'f-logo-fit', label: 'Fitting', value: logo.fit,
          options: [{ value: 'cover', label: 'Fill the shape (may crop)' }, { value: 'contain', label: 'Fit inside (shows all of it)' }],
          onChange: function (v) { logo.fit = v; saveDraft(); render(); } })
      ]),
      rangeField({ label: 'Size', min: 40, max: 140, value: logo.size,
        format: function (v) { return v + ' px'; },
        onChange: function (v) { logo.size = parseInt(v, 10); saveDraft(); } }),
      textField({ id: 'f-logo-alt', label: 'Description for screen readers', value: logo.alt,
        hint: 'Read aloud in place of the picture. "Club emblem" is usually right.',
        onChange: function (v) { logo.alt = v; saveDraft(); } }),
      el('div', { class: 'row', style: 'margin-top:12px' }, [
        checkField({ label: 'Show the logo in the header', value: logo.show,
          onChange: function (v) { logo.show = v; saveDraft(); } }),
        checkField({ label: 'Use it as the browser tab icon too', value: logo.useAsFavicon,
          onChange: function (v) { logo.useAsFavicon = v; saveDraft(); } })
      ])
    ]));
  });

  // ---- Banners ------------------------------------------------------------
  section('banners', 'Banners', 'Website', '▤', function (stage) {
    stage.appendChild(head('Banners',
      'The pictures that slide across the top of the home page. Add as many as you like — '
      + 'they change automatically, and visitors can move between them.'));

    var list = el('div', {});
    var banners = draft.banners || (draft.banners = []);

    if (!banners.length) {
      list.appendChild(el('div', { class: 'empty' }, [
        el('strong', { text: 'No banners yet' }),
        'Add one below. A banner can be a picture, or words on a plain background, or both.'
      ]));
    }

    banners.forEach(function (banner, index) {
      var imageBox = el('div', { class: 'field' });

      function drawImage() {
        clear(imageBox);
        if (banner.image) {
          imageBox.appendChild(el('img', { src: banner.image, alt: '', class: 'thumb' }));
          imageBox.appendChild(el('div', { class: 'file-size' }, [
            banner.image.slice(0, 5) === 'data:' ? readableSize(banner.image.length) + ' inside content.js' : banner.image,
            el('button', {
              class: 'btn btn-danger btn-sm', type: 'button', text: 'Remove picture',
              onclick: function () { banner.image = ''; saveDraft(); render(); }
            })
          ]));
        } else {
          imageBox.appendChild(picker({
            preset: 'banner', label: 'Choose a picture for this banner',
            sub: 'Wide pictures work best — about 1600 by 900. Or leave it plain.',
            onPicked: function (result) {
              banner.image = result.src;
              saveDraft();
              logEntry('Added a banner picture');
              toast('Picture added — ' + result.note, 'good');
              render();
            }
          }));
        }
      }
      drawImage();

      list.appendChild(itemShell({
        index: index, total: banners.length, name: banner.title || 'Untitled banner',
        onMove: function (by) { move(banners, index, by); saveDraft(); render(); },
        onRemove: function () { banners.splice(index, 1); saveDraft(); logEntry('Removed a banner'); render(); },
        children: [
          imageBox,
          textField({ id: 'b-eyebrow-' + index, label: 'Small line above the heading', value: banner.eyebrow,
            placeholder: 'Programmes', onChange: function (v) { banner.eyebrow = v; saveDraft(); } }),
          textField({ id: 'b-title-' + index, label: 'Heading', value: banner.title,
            onChange: function (v) { banner.title = v; saveDraft(); } }),
          textField({ id: 'b-text-' + index, label: 'Paragraph', value: banner.text, rows: 2,
            onChange: function (v) { banner.text = v; saveDraft(); } }),
          el('div', { class: 'two' }, [
            textField({ id: 'b-p1-' + index, label: 'First button — words', value: (banner.primary || {}).label,
              onChange: function (v) { banner.primary = banner.primary || {}; banner.primary.label = v; saveDraft(); } }),
            selectField({ id: 'b-p1h-' + index, label: 'First button — page', value: (banner.primary || {}).href,
              options: PAGES.map(function (p) { return { value: p, label: p }; }),
              onChange: function (v) { banner.primary = banner.primary || {}; banner.primary.href = v; saveDraft(); } })
          ]),
          el('div', { class: 'two' }, [
            textField({ id: 'b-p2-' + index, label: 'Second button — words', value: (banner.secondary || {}).label,
              onChange: function (v) { banner.secondary = banner.secondary || {}; banner.secondary.label = v; saveDraft(); } }),
            selectField({ id: 'b-p2h-' + index, label: 'Second button — page', value: (banner.secondary || {}).href,
              options: PAGES.map(function (p) { return { value: p, label: p }; }),
              onChange: function (v) { banner.secondary = banner.secondary || {}; banner.secondary.href = v; saveDraft(); } })
          ]),
          el('div', { class: 'two' }, [
            rangeField({ label: 'Darkening over the picture', min: 0, max: 100, value: Math.round((banner.overlay === undefined ? 0.78 : banner.overlay) * 100),
              format: function (v) { return v + '%'; },
              hint: 'More darkening makes white text easier to read.',
              onChange: function (v) { banner.overlay = parseInt(v, 10) / 100; saveDraft(); } }),
            selectField({ id: 'b-align-' + index, label: 'Text position', value: banner.align || 'left',
              options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centred' }],
              onChange: function (v) { banner.align = v; saveDraft(); } })
          ])
        ]
      }));
    });

    stage.appendChild(card('Banners', banners.length + (banners.length === 1 ? ' banner' : ' banners'), [
      list,
      el('button', {
        class: 'btn btn-accent', type: 'button', text: '+ Add a banner',
        onclick: function () {
          banners.push({ image: '', eyebrow: '', title: 'New banner', text: '', overlay: 0.78, align: 'left',
                         primary: { label: '', href: 'index.html' }, secondary: { label: '', href: 'index.html' } });
          saveDraft();
          logEntry('Added a banner');
          render();
        }
      })
    ]));

    var settings = draft.bannerSettings;
    stage.appendChild(card('How the banners behave', null, [
      rangeField({ label: 'Height', min: 240, max: 640, step: 20, value: settings.height,
        format: function (v) { return v + ' px'; },
        onChange: function (v) { settings.height = parseInt(v, 10); saveDraft(); } }),
      rangeField({ label: 'Seconds on each banner', min: 2, max: 20, value: Math.round(settings.interval / 1000),
        format: function (v) { return v + ' s'; },
        onChange: function (v) { settings.interval = parseInt(v, 10) * 1000; saveDraft(); } }),
      el('div', { class: 'row' }, [
        checkField({ label: 'Change on their own', value: settings.autoplay,
          onChange: function (v) { settings.autoplay = v; saveDraft(); } }),
        checkField({ label: 'Show the dots', value: settings.showDots,
          onChange: function (v) { settings.showDots = v; saveDraft(); } }),
        checkField({ label: 'Show the arrows', value: settings.showArrows,
          onChange: function (v) { settings.showArrows = v; saveDraft(); } })
      ]),
      el('div', { class: 'hint', style: 'margin-top:10px' , text:
        'Visitors who have asked their device to reduce motion never see the banners move on their own. '
        + 'The arrows and dots still work for them.' })
    ]));
  });

  // ---- Typefaces ----------------------------------------------------------
  section('type', 'Typefaces', 'Appearance', 'Aa', function (stage) {
    var fonts = draft.fonts;
    stage.appendChild(head('Typefaces',
      'The lettering used across the whole website — one face for headings, one for reading text.'));

    var preview = el('div', { class: 'type-preview' }, [
      el('div', { class: 'display', text: draft.orgName || 'Krishnanagar Youth & Cultural Club' }),
      el('p', { class: 'body-text', text: 'Membership is open to every resident of the ward. '
        + 'The office is open Monday to Saturday. আমাদের ক্লাবে আপনাকে স্বাগতম — 0123456789.' })
    ]);

    function drawPreview() {
      preview.querySelector('.display').style.fontFamily = fonts.headingFamily;
      preview.querySelector('.display').style.fontWeight = fonts.headingWeight;
      preview.querySelector('.display').style.letterSpacing = fonts.headingSpacing + 'em';
      preview.querySelector('.body-text').style.fontFamily = fonts.bodyFamily;
      loadPreviewFonts();
    }

    function loadPreviewFonts() {
      [fonts.headingGoogle, fonts.bodyGoogle].forEach(function (family) {
        if (!family) return;
        var id = 'gf-' + family.replace(/[^\w]/g, '');
        if (byId(id)) return;
        document.head.appendChild(el('link', {
          id: id, rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family) + '&display=swap'
        }));
      });
    }

    function fontSelect(id, label, currentStack, apply) {
      var options = FONTS.map(function (font, i) { return { value: String(i), label: font.label }; });
      var chosen = '0';
      FONTS.forEach(function (font, i) { if (font.stack === currentStack) chosen = String(i); });
      return selectField({
        id: id, label: label, value: chosen, options: options,
        onChange: function (value) {
          var font = FONTS[parseInt(value, 10)];
          apply(font);
          saveDraft();
          drawPreview();
        }
      });
    }

    stage.appendChild(card('Choose the lettering', null, [
      fontSelect('f-heading', 'Headings and the club name', fonts.headingFamily, function (font) {
        fonts.headingFamily = font.stack;
        fonts.headingGoogle = font.google;
      }),
      fontSelect('f-body', 'Reading text', fonts.bodyFamily, function (font) {
        fonts.bodyFamily = font.stack;
        fonts.bodyGoogle = font.google;
      }),
      el('div', { class: 'note' }, [
        el('strong', { text: 'Bengali and other Indic scripts' }),
        'Noto Serif Bengali, Noto Sans Bengali, Hind Siliguri and Mukta all carry the Bengali alphabet. '
        + 'The first two entries in each list use lettering already on the visitor\'s device, so they need no download at all.'
      ]),
      preview
    ]));

    stage.appendChild(card('Fine adjustment', null, [
      rangeField({ label: 'Overall text size', min: 90, max: 125, value: fonts.scale,
        format: function (v) { return v + '%'; },
        hint: 'Applies to the whole site. Visitors can still enlarge it further from the top strip.',
        onChange: function (v) { fonts.scale = parseInt(v, 10); saveDraft(); } }),
      el('div', { class: 'two' }, [
        selectField({ id: 'f-weight', label: 'Heading thickness', value: fonts.headingWeight,
          options: [{ value: 400, label: 'Regular' }, { value: 500, label: 'Medium' }, { value: 600, label: 'Semi-bold' }, { value: 700, label: 'Bold' }],
          onChange: function (v) { fonts.headingWeight = parseInt(v, 10); saveDraft(); drawPreview(); } }),
        selectField({ id: 'f-spacing', label: 'Heading letter spacing', value: fonts.headingSpacing,
          options: [{ value: -0.02, label: 'Tight' }, { value: 0, label: 'Normal' }, { value: 0.02, label: 'Open' }, { value: 0.05, label: 'Wide' }],
          onChange: function (v) { fonts.headingSpacing = parseFloat(v); saveDraft(); drawPreview(); } })
      ])
    ]));

    drawPreview();
  });

  // ---- Colours ------------------------------------------------------------
  section('colours', 'Colours', 'Appearance', '◐', function (stage) {
    stage.appendChild(head('Colours',
      'One set of colours paints the whole site — header, navigation, buttons and rules.'));

    stage.appendChild(card('Ready-made sets', null, [
      el('div', { class: 'row' }, PALETTES.map(function (palette) {
        var strip = el('span', { style: 'display:inline-flex;border-radius:3px;overflow:hidden;border:1px solid rgba(0,0,0,.2)' },
          ['primary', 'primaryLight', 'accent'].map(function (key) {
            return el('span', { style: 'width:13px;height:15px;background:' + palette.colours[key] });
          }));
        return el('button', {
          class: 'btn btn-quiet', type: 'button',
          onclick: function () {
            draft.theme = clone(palette.colours);
            saveDraft();
            logEntry('Applied the colour set "' + palette.name + '"');
            render();
            toast(palette.name + ' applied', 'good');
          }
        }, [strip, palette.name]);
      }))
    ]));

    stage.appendChild(card('Each colour', null, [
      el('div', { class: 'swatches' }, COLOUR_FIELDS.map(function (field) {
        var value = draft.theme[field.key] || '#000000';
        var colour = el('input', { type: 'color', value: value, 'aria-label': field.label });
        var text = el('input', { type: 'text', value: value, spellcheck: 'false' });
        colour.addEventListener('input', function () {
          text.value = colour.value; draft.theme[field.key] = colour.value; saveDraft();
        });
        text.addEventListener('input', function () {
          if (/^#[0-9a-f]{6}$/i.test(text.value)) {
            colour.value = text.value; draft.theme[field.key] = text.value; saveDraft();
          }
        });
        return el('div', { class: 'swatch' }, [
          el('label', { text: field.label }),
          el('div', { class: 'pick' }, [colour, text])
        ]);
      })),
      el('div', { class: 'note', style: 'margin:16px 0 0' }, [
        el('strong', { text: 'Dark mode and high contrast are not affected.' }),
        'Visitors who switch the site to dark or high-contrast mode keep those settings — '
        + 'they are there for readability, so a colour choice here does not override them.'
      ])
    ]));
  });

  // ---- Header -------------------------------------------------------------
  section('header', 'Header and menu', 'Appearance', '▀', function (stage) {
    var header = draft.header;
    stage.appendChild(head('Header and menu',
      'The strip along the very top, the block with the name and logo, and the menu below it.'));

    stage.appendChild(card('Top strip', null, [
      textField({ id: 'h-strip', label: 'Words on the left', value: header.topStripText,
        onChange: function (v) { header.topStripText = v; saveDraft(); } }),
      el('div', { class: 'row' }, [
        checkField({ label: 'Show the top strip', value: header.showTopStrip,
          onChange: function (v) { header.showTopStrip = v; saveDraft(); } }),
        checkField({ label: 'Show the text-size and dark-mode buttons', value: header.showAppearanceButtons,
          onChange: function (v) { header.showAppearanceButtons = v; saveDraft(); } }),
        checkField({ label: 'Show the Admin Panel links', value: header.showStaffLinks,
          onChange: function (v) { header.showStaffLinks = v; saveDraft(); } })
      ]),
      el('div', { class: 'hint', style: 'margin-top:9px', text:
        'Hiding the Admin Panel links only takes them out of the menus. The addresses still work, '
        + 'so keep your password — and see Server lock if you want them properly closed off.' })
    ]));

    stage.appendChild(card('Name block', null, [
      el('div', { class: 'row' }, [
        checkField({ label: 'Show telephone, e-mail and hours beside the name', value: header.showContact,
          onChange: function (v) { header.showContact = v; saveDraft(); } }),
        checkField({ label: 'Show the scrolling notice strip', value: header.showTicker,
          onChange: function (v) { header.showTicker = v; saveDraft(); } }),
        checkField({ label: 'Menu stays on screen when scrolling', value: header.stickyNav,
          onChange: function (v) { header.stickyNav = v; saveDraft(); } })
      ])
    ]));

    var links = header.navLinks;
    var list = el('div', {});
    links.forEach(function (item, index) {
      list.appendChild(itemShell({
        index: index, total: links.length, name: item.label,
        onMove: function (by) { move(links, index, by); saveDraft(); render(); },
        onRemove: function () { links.splice(index, 1); saveDraft(); render(); },
        children: [
          el('div', { class: 'two' }, [
            textField({ id: 'n-label-' + index, label: 'Words in the menu', value: item.label,
              onChange: function (v) { item.label = v; saveDraft(); } }),
            selectField({ id: 'n-href-' + index, label: 'Page it opens', value: item.href,
              options: PAGES.map(function (p) { return { value: p, label: p }; }),
              onChange: function (v) { item.href = v; saveDraft(); } })
          ])
        ]
      }));
    });

    stage.appendChild(card('Menu', links.length + ' entries', [
      list,
      el('button', {
        class: 'btn btn-accent', type: 'button', text: '+ Add a menu entry',
        onclick: function () { links.push({ label: 'New page', href: 'index.html' }); saveDraft(); render(); }
      }),
      el('div', { class: 'hint', style: 'margin-top:10px', text:
        'The list only points at pages that already exist in your website folder. To add a new page, '
        + 'copy one of the .html files, change its text, upload it, and it will appear in this list after you rename it.' })
    ]));
  });

  // ---- Footer -------------------------------------------------------------
  section('footer', 'Footer', 'Appearance', '▄', function (stage) {
    var footer = draft.footer;
    stage.appendChild(head('Footer',
      'The dark block at the bottom of every page: the club\'s details, columns of links, and the copyright line.'));

    stage.appendChild(card('Wording', null, [
      textField({ id: 'ft-about', label: 'Line under the club name', value: footer.about, rows: 2,
        placeholder: 'Leave empty to keep the registration details already there.',
        onChange: function (v) { footer.about = v; saveDraft(); } }),
      textField({ id: 'ft-copy', label: 'Copyright line', value: footer.copyright,
        placeholder: '© 2026 Krishnanagar Youth & Cultural Club. All rights reserved.',
        hint: 'Leave empty and the year is filled in for you, along with the club name.',
        onChange: function (v) { footer.copyright = v; saveDraft(); } }),
      el('div', { class: 'row' }, [
        checkField({ label: 'Keep the office address column', value: footer.keepOfficeColumn,
          onChange: function (v) { footer.keepOfficeColumn = v; saveDraft(); } }),
        checkField({ label: 'Show the Admin Panel links', value: footer.showStaffLinks,
          onChange: function (v) { footer.showStaffLinks = v; saveDraft(); } })
      ])
    ]));

    var columns = footer.columns;
    var list = el('div', {});

    if (!columns.length) {
      list.appendChild(el('div', { class: 'empty' }, [
        el('strong', { text: 'No link columns' }),
        'The footer will show the club details and the office address only.'
      ]));
    }

    columns.forEach(function (column, index) {
      var linkRows = el('div', {});
      column.links = column.links || [];
      column.links.forEach(function (item, linkIndex) {
        var label = el('input', { type: 'text', value: item.label, placeholder: 'Words' });
        var select = el('select', {});
        PAGES.forEach(function (page) {
          var option = el('option', { value: page, text: page });
          if (page === item.href) option.selected = true;
          select.appendChild(option);
        });
        label.addEventListener('input', function () { item.label = label.value; saveDraft(); });
        select.addEventListener('change', function () { item.href = select.value; saveDraft(); });
        linkRows.appendChild(el('div', { style: 'display:flex;gap:8px;margin-bottom:7px' }, [
          label, select,
          el('button', {
            class: 'btn btn-danger btn-sm', type: 'button', text: '×', title: 'Remove this link',
            onclick: function () { column.links.splice(linkIndex, 1); saveDraft(); render(); }
          })
        ]));
      });

      list.appendChild(itemShell({
        index: index, total: columns.length, name: column.title,
        onMove: function (by) { move(columns, index, by); saveDraft(); render(); },
        onRemove: function () { columns.splice(index, 1); saveDraft(); render(); },
        children: [
          textField({ id: 'fc-title-' + index, label: 'Column heading', value: column.title,
            onChange: function (v) { column.title = v; saveDraft(); } }),
          el('label', { text: 'Links' }),
          linkRows,
          el('button', {
            class: 'btn btn-quiet btn-sm', type: 'button', text: '+ Add a link',
            onclick: function () { column.links.push({ label: 'New link', href: 'index.html' }); saveDraft(); render(); }
          })
        ]
      }));
    });

    stage.appendChild(card('Columns of links', columns.length + ' columns', [
      list,
      el('button', {
        class: 'btn btn-accent', type: 'button', text: '+ Add a column',
        onclick: function () { columns.push({ title: 'New column', links: [] }); saveDraft(); render(); }
      })
    ]));
  });

  // ---- Pictures -----------------------------------------------------------
  section('pictures', 'Photographs', 'Website', '▣', function (stage) {
    var pictures = draft.pictures || (draft.pictures = []);
    stage.appendChild(head('Photographs',
      'The gallery. Choose several pictures at once — they are scaled down for the web as they come in.'));

    stage.appendChild(card('Add photographs', null, [
      picker({
        preset: 'picture', multiple: true,
        label: 'Choose photographs from your computer',
        sub: 'You can select several at once, or drag a whole batch here.',
        onPicked: function (results) {
          results.forEach(function (result) {
            pictures.push({
              src: result.src,
              caption: result.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
              category: 'General', description: ''
            });
          });
          saveDraft();
          logEntry('Added ' + results.length + ' photograph(s)');
          toast(results.length + ' added', 'good');
          render();
        }
      }),
      el('div', { class: 'note warn', style: 'margin:14px 0 0' }, [
        el('strong', { text: 'Photographs make content.js large.' }),
        'Each one adds roughly 100–300 KB. Past about 30 pictures the file gets slow to upload and slow '
        + 'for visitors — at that point upload them to assets/img/ through cPanel instead and type the '
        + 'path into the picture\'s address box.'
      ])
    ]));

    if (!pictures.length) {
      stage.appendChild(el('div', { class: 'empty' }, [
        el('strong', { text: 'No photographs yet' }),
        'The gallery will keep the pictures already in the pages.'
      ]));
      return;
    }

    var grid = el('div', { class: 'pic-grid' });
    pictures.forEach(function (picture, index) {
      var caption = el('input', { type: 'text', value: picture.caption, placeholder: 'Caption' });
      var category = el('input', { type: 'text', value: picture.category, placeholder: 'Category' });
      caption.addEventListener('input', function () { picture.caption = caption.value; saveDraft(); });
      category.addEventListener('input', function () { picture.category = category.value; saveDraft(); });

      grid.appendChild(el('div', { class: 'pic' }, [
        el('img', { src: picture.src, alt: '' }),
        el('div', { class: 'meta' }, [
          caption, category,
          el('div', { style: 'display:flex;gap:5px' }, [
            el('button', { class: 'btn btn-quiet btn-sm', type: 'button', text: '←', title: 'Move earlier',
              disabled: index === 0, onclick: function () { move(pictures, index, -1); saveDraft(); render(); } }),
            el('button', { class: 'btn btn-quiet btn-sm', type: 'button', text: '→', title: 'Move later',
              disabled: index === pictures.length - 1, onclick: function () { move(pictures, index, 1); saveDraft(); render(); } }),
            el('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Remove',
              onclick: function () {
                if (window.confirm('Remove this photograph?')) {
                  pictures.splice(index, 1); saveDraft(); logEntry('Removed a photograph'); render();
                }
              } })
          ]),
          el('div', { class: 'file-size', text: picture.src.slice(0, 5) === 'data:' ? readableSize(picture.src.length) : 'on the host' })
        ])
      ]));
    });

    stage.appendChild(card('Gallery', pictures.length + ' photographs', [grid]));
  });

  // ---- Office and notices -------------------------------------------------
  section('office', 'Office and notices', 'Website', '✉', function (stage) {
    stage.appendChild(head('Office and notices',
      'The address and contact details in the header and footer, and the notices that scroll across the top.'));

    stage.appendChild(card('Office details', null, [
      textField({ id: 'o-address', label: 'Address', value: draft.address, rows: 3,
        hint: 'Press Enter for a new line — the footer keeps the line breaks.',
        onChange: function (v) { draft.address = v; saveDraft(); } }),
      el('div', { class: 'two' }, [
        textField({ id: 'o-phone', label: 'Telephone', value: draft.phone,
          onChange: function (v) { draft.phone = v; saveDraft(); } }),
        textField({ id: 'o-email', label: 'E-mail', value: draft.email, type: 'email',
          onChange: function (v) { draft.email = v; saveDraft(); } })
      ]),
      textField({ id: 'o-hours', label: 'Office hours — footer', value: draft.hours,
        onChange: function (v) { draft.hours = v; saveDraft(); } }),
      textField({ id: 'o-hours-s', label: 'Office hours — header, shorter', value: draft.hoursShort,
        onChange: function (v) { draft.hoursShort = v; saveDraft(); } })
    ]));

    var notices = draft.notices || (draft.notices = []);
    var list = el('div', {});
    notices.forEach(function (notice, index) {
      var text = el('input', { type: 'text', value: notice.text, placeholder: 'Notice text' });
      var select = el('select', {});
      PAGES.forEach(function (page) {
        var option = el('option', { value: page, text: page });
        if (page === notice.href) option.selected = true;
        select.appendChild(option);
      });
      text.addEventListener('input', function () { notice.text = text.value; saveDraft(); });
      select.addEventListener('change', function () { notice.href = select.value; saveDraft(); });

      list.appendChild(el('div', { style: 'display:flex;gap:8px;margin-bottom:8px;align-items:center' }, [
        el('span', { class: 'mono', style: 'color:#5b6775;flex:none', text: String(index + 1) }),
        text, select,
        el('button', { class: 'btn btn-quiet btn-sm', type: 'button', text: '↑', disabled: index === 0,
          onclick: function () { move(notices, index, -1); saveDraft(); render(); } }),
        el('button', { class: 'btn btn-danger btn-sm', type: 'button', text: '×',
          onclick: function () { notices.splice(index, 1); saveDraft(); render(); } })
      ]));
    });

    stage.appendChild(card('Scrolling notices', notices.length + ' notices', [
      list,
      el('button', {
        class: 'btn btn-accent', type: 'button', text: '+ Add a notice',
        onclick: function () { notices.push({ text: '', href: 'notices.html' }); saveDraft(); render(); }
      })
    ]));
  });

  // ---- Publish ------------------------------------------------------------
  section('publish', 'Publish', 'Website', '⬆', function (stage) {
    stage.appendChild(head('Publish',
      'Two steps: download the file, then upload it to your host. Nothing on the website changes until you do.'));

    var file = contentFile();
    var size = bytesOf(file);
    var images = pictureBytes();
    var changed = fingerprint(published()) !== publishedFingerprint();

    stage.appendChild(card('Step 1 — download', null, [
      el('p', { text: 'This writes one file, content.js, holding everything you have set in this panel.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn btn-accent', type: 'button', text: '⬇ Download content.js', onclick: doPublish }),
        el('button', { class: 'btn btn-quiet', type: 'button', text: '⧉ Copy it instead', onclick: function () {
          copyText(file, 'content.js copied. Paste it over the file in your host\'s File Manager.');
        } }),
        el('button', { class: 'btn btn-quiet', type: 'button', text: '↗ Preview first', onclick: openPreview })
      ]),
      el('div', { class: 'file-size', style: 'margin-top:12px' }, [
        'Size: ' + readableSize(size) + (images ? '  ·  pictures make up ' + readableSize(images) : '')
      ]),
      size > 3 * 1024 * 1024 ? el('div', { class: 'note warn', style: 'margin-top:12px' }, [
        el('strong', { text: 'This file is getting large.' }),
        'Every visitor downloads it before the page appears. Consider uploading the biggest pictures to '
        + 'assets/img/ through cPanel and pointing at them by path instead.'
      ]) : null
    ]));

    stage.appendChild(card('Step 2 — upload', null, [
      el('ol', {}, [
        el('li', { html: 'Open your hosting control panel and go to <strong>File Manager</strong>.' }),
        el('li', { html: 'Open <code>public_html</code>, then <code>assets</code>, then <code>js</code>.' }),
        el('li', { html: 'Upload <code>content.js</code>, replacing the file already there.' }),
        el('li', { html: 'Visit your website and refresh with <code>Ctrl</code>+<code>F5</code>.' })
      ]),
      el('div', { class: 'note' }, [
        el('strong', { text: 'It has to land at exactly this path:' }),
        el('code', { text: 'public_html/assets/js/content.js' })
      ])
    ]));

    stage.appendChild(card('What is in the file', readableSize(size), [
      el('pre', { text: file.length > 4000 ? file.slice(0, 4000) + '\n\n…and ' + readableSize(size - 4000) + ' more, mostly pictures.' : file })
    ]));

    if (!changed) {
      stage.appendChild(el('div', { class: 'note ok' }, [
        el('strong', { text: 'Already downloaded.' }),
        'Nothing has changed since the last time you published from this browser. '
        + 'If the website still looks wrong, the file has probably not been uploaded yet.'
      ]));
    }
  });

  // ---- Administrators (Super Admin) ---------------------------------------
  // Password changes accumulate here across one signed-in session. Without this
  // the second change would start again from the published file and silently
  // drop the first, so changing both passwords produced a file carrying only one.
  var authDraft = null;
  var authPending = {};

  section('accounts', 'Administrators', 'Super Admin', '☖', function (stage) {
    stage.appendChild(head('Administrators',
      'Who can sign in, and to which panel. Changes here are written into panel-auth.js, '
      + 'which you upload alongside content.js.'));

    var accounts = auth().accounts || [];

    stage.appendChild(card('Accounts', accounts.length + ' accounts', [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Name' }), el('th', { text: 'Panel' }), el('th', { text: 'Password stored as' })
        ])]),
        el('tbody', {}, accounts.map(function (item) {
          return el('tr', {}, [
            el('td', { text: item.name }),
            el('td', {}, [el('span', {
              class: 'pill ' + (item.role === 'super' ? 'seal' : 'gold'),
              text: item.role === 'super' ? 'Super Admin' : 'Admin'
            })]),
            el('td', { class: 'mono', text: item.hash.slice(0, 16) + '…' })
          ]);
        }))
      ]),
      el('div', { class: 'note', style: 'margin:16px 0 0' }, [
        el('strong', { text: 'The passwords themselves are not stored anywhere.' }),
        'What is kept is a PBKDF2-SHA256 hash: it can confirm a password typed at the sign-in box, '
        + 'but it cannot be turned back into one. Even someone who downloads panel-auth.js cannot read a password out of it.'
      ])
    ]));

    stage.appendChild(passwordCard());
  }, true);

  function passwordCard() {
    var chosen = 'admin';
    var first = el('input', { type: 'password', id: 'pw-1', autocomplete: 'new-password' });
    var second = el('input', { type: 'password', id: 'pw-2', autocomplete: 'new-password' });
    var strength = el('div', { class: 'hint' });
    var output = el('div', {});

    first.addEventListener('input', function () {
      var value = first.value;
      var score = 0;
      if (value.length >= 10) score++;
      if (value.length >= 14) score++;
      if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
      if (/\d/.test(value)) score++;
      if (/[^\w]/.test(value)) score++;
      strength.textContent = value ? ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][score] : '';
    });

    return card('Change a password', null, [
      selectField({
        id: 'pw-who', label: 'Which sign-in', value: 'admin',
        options: [
          { value: 'admin', label: 'Admin Panel' },
          { value: 'super', label: 'Super Admin Panel' }
        ],
        onChange: function (value) { chosen = value; }
      }),
      el('div', { class: 'field' }, [el('label', { for: 'pw-1', text: 'New password' }), first, strength]),
      el('div', { class: 'field' }, [el('label', { for: 'pw-2', text: 'Type it again' }), second]),
      el('button', {
        class: 'btn btn-accent', type: 'button', text: 'Work out the new file',
        onclick: function () {
          if (first.value.length < 8) { toast('Use at least 8 characters.', 'bad'); return; }
          if (first.value !== second.value) { toast('The two entries do not match.', 'bad'); return; }
          clear(output);
          output.appendChild(el('p', { class: 'hint', text: 'Working…' }));

          var settings = auth();
          var salt = randomSalt('kycc.' + chosen);
          derive(first.value, salt, settings.iterations).then(function (hash) {
            // Build on the draft, not on the published file, so that changing
            // the Admin password and then the Super Admin password yields one
            // file holding both.
            if (!authDraft) authDraft = clone(settings.accounts);
            authDraft = authDraft.map(function (item) {
              if (item.role === chosen) { item.salt = salt; item.hash = hash; }
              return item;
            });
            authPending[chosen] = true;
            var text = authFile(authDraft, settings);
            clear(output);
            var waiting = [];
            if (authPending.admin) waiting.push('Admin Panel');
            if (authPending.super) waiting.push('Super Admin Panel');
            output.appendChild(el('div', { class: 'note ok' }, [
              el('strong', { text: 'New file ready.' }),
              'It sets the password for ' + waiting.join(' and ') + '. '
              + 'The change takes effect the moment this file is on your host. '
              + 'Until then the old passwords are still the ones that open the panels.'
            ]));
            if (waiting.length === 1) {
              output.appendChild(el('p', { class: 'hint' },
                ['To change the other password too, do it now — the download will then '
                 + 'carry both. Downloading twice is not needed.']));
            }
            output.appendChild(el('div', { class: 'row' }, [
              el('button', {
                class: 'btn btn-accent', type: 'button', text: '⬇ Download panel-auth.js',
                onclick: function () {
                  download('panel-auth.js', text, 'application/javascript');
                  logEntry('Changed the ' + chosen + ' password');
                  toast('Upload it to assets/js/panel-auth.js', 'good');
                }
              }),
              el('button', {
                class: 'btn btn-quiet', type: 'button', text: '⧉ Copy it',
                onclick: function () { copyText(text, 'panel-auth.js copied.'); }
              })
            ]));
            output.appendChild(el('div', { class: 'note', style: 'margin-top:14px' }, [
              el('strong', { text: 'Upload it to:' }),
              el('code', { text: 'public_html/assets/js/panel-auth.js' })
            ]));
            first.value = ''; second.value = ''; strength.textContent = '';
          });
        }
      }),
      output
    ]);
  }

  function authFile(accounts, settings) {
    return '/* -----------------------------------------------------------------\n'
         + '   panel-auth.js — who may sign in to the panels.\n\n'
         + '   Written by the Super Admin Panel on ' + new Date().toLocaleString() + '.\n'
         + '   Upload to  assets/js/panel-auth.js  on your web host.\n\n'
         + '   The passwords are not in this file. Each line holds a PBKDF2-SHA256\n'
         + '   hash, which can check a password but cannot reveal one.\n'
         + '   ----------------------------------------------------------------- */\n\n'
         + 'window.CLUB_PANEL_AUTH = ' + JSON.stringify({
             version: settings.version || 2,
             iterations: settings.iterations,
             accounts: accounts,
             idleMinutes: settings.idleMinutes,
             lockAfterAttempts: settings.lockAfterAttempts,
             lockSeconds: settings.lockSeconds
           }, null, 2) + ';\n';
  }

  // ---- Server lock (Super Admin) ------------------------------------------
  section('lock', 'Server lock', 'Super Admin', '⚿', function (stage) {
    stage.appendChild(head('Server lock',
      'The sign-in on these panels is a lock on the screen. This puts one on the server itself, '
      + 'so the pages cannot even be opened without a password.'));

    stage.appendChild(el('div', { class: 'note' }, [
      el('strong', { text: 'Why this is worth five minutes.' }),
      'A website on plain hosting has no server that can check a password — every page is just a file. '
      + 'The panel sign-in keeps out anyone who wanders in, and it is what stops a visitor from idly '
      + 'opening the editor. But the files are still there to be fetched. Apache, which runs almost '
      + 'every cPanel host, can refuse them outright. That is a real lock, and it takes two small files.'
    ]));

    var user = el('input', { type: 'text', value: 'clubadmin', id: 'lk-user' });
    var pass = el('input', { type: 'password', id: 'lk-pass', autocomplete: 'new-password' });
    var output = el('div', {});

    stage.appendChild(card('Make the two files', null, [
      el('div', { class: 'two' }, [
        el('div', { class: 'field' }, [el('label', { for: 'lk-user', text: 'User name for the server prompt' }), user]),
        el('div', { class: 'field' }, [el('label', { for: 'lk-pass', text: 'Password for the server prompt' }), pass])
      ]),
      el('div', { class: 'hint', text: 'This is separate from the panel password. It is what the browser will ask for.' }),
      el('button', {
        class: 'btn btn-accent', type: 'button', text: 'Make the files', style: 'margin-top:12px',
        onclick: function () {
          if (!user.value.trim() || pass.value.length < 8) {
            toast('Give a user name and a password of at least 8 characters.', 'bad');
            return;
          }
          var line = user.value.trim() + ':{SHA}' + toBase64(sha1(utf8(pass.value)));
          var htaccess =
            '# Password-protect the admin panels.\n'
            + '# Put this file in public_html/adminpanel/ and again in public_html/superadminpanel/\n'
            + '# Change the path below to the real one shown in cPanel > File Manager.\n\n'
            + 'AuthType Basic\n'
            + 'AuthName "Club administration"\n'
            + 'AuthUserFile /home/YOURCPANELUSER/.htpasswd-club\n'
            + 'Require valid-user\n';

          clear(output);
          output.appendChild(el('div', { class: 'note ok' }, [
            el('strong', { text: 'Both files are ready.' }),
            'Download them, then follow the four steps below.'
          ]));
          output.appendChild(el('div', { class: 'row' }, [
            el('button', { class: 'btn btn-accent', type: 'button', text: '⬇ .htpasswd-club',
              onclick: function () { download('.htpasswd-club', line + '\n'); } }),
            el('button', { class: 'btn btn-accent', type: 'button', text: '⬇ .htaccess',
              onclick: function () { download('.htaccess', htaccess); } })
          ]));
          output.appendChild(el('pre', { text: line + '\n\n' + htaccess }));
          logEntry('Generated a server lock');
        }
      }),
      output
    ]));

    stage.appendChild(card('Putting them in place', null, [
      el('ol', {}, [
        el('li', { html: 'Upload <code>.htpasswd-club</code> to your <strong>home folder</strong> — one level '
          + 'above <code>public_html</code>, so the web cannot reach it.' }),
        el('li', { html: 'In cPanel\'s File Manager, turn on <strong>Show hidden files</strong>, then note the '
          + 'full path shown at the top, such as <code>/home/username</code>.' }),
        el('li', { html: 'Open <code>.htaccess</code> in a text editor and put that path into the '
          + '<code>AuthUserFile</code> line.' }),
        el('li', { html: 'Upload the edited <code>.htaccess</code> into <code>public_html/adminpanel/</code> '
          + 'and a copy into <code>public_html/superadminpanel/</code>.' })
      ]),
      el('div', { class: 'note warn' }, [
        el('strong', { text: 'Test it in a private window before you rely on it.' }),
        'You should be asked for the user name and password before the panel appears. If instead you get '
        + '"500 Internal Server Error", the path in AuthUserFile is wrong — fix it, or delete the .htaccess '
        + 'to put things back as they were.'
      ]),
      el('div', { class: 'hint', text: 'Many cPanel installations also have "Directory Privacy", which does '
        + 'the same job through a form. If your host has it, use that instead — it writes these files for you.' })
    ]));
  }, true);

  // ---- Backup (Super Admin) ----------------------------------------------
  section('backup', 'Backup', 'Super Admin', '⛁', function (stage) {
    stage.appendChild(head('Backup',
      'A copy of every setting in this panel, in one file you can keep and put back later.'));

    stage.appendChild(card('Save a copy', null, [
      el('p', { text: 'This is the same information as content.js, in a form the panel can read back in. '
                    + 'Keep one before a large change.' }),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn-accent', type: 'button', text: '⬇ Download the backup',
          onclick: function () {
            var stamp = new Date().toISOString().slice(0, 10);
            download('club-settings-' + stamp + '.json', JSON.stringify(published(), null, 2), 'application/json');
            logEntry('Downloaded a backup');
            toast('Backup saved', 'good');
          }
        })
      ])
    ]));

    var restore = el('input', { type: 'file', accept: '.json,application/json' });
    restore.addEventListener('change', function () {
      var file = restore.files && restore.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result));
          if (!data || typeof data !== 'object') throw new Error('not settings');
          if (!window.confirm('Replace everything in this panel with the contents of that file?')) return;
          draft = mergeInto(clone(DEFAULTS), data);
          saveDraft();
          logEntry('Restored from a backup');
          toast('Restored', 'good');
          render();
        } catch (e) {
          toast('That file is not a settings backup.', 'bad');
        }
        restore.value = '';
      };
      reader.readAsText(file);
    });

    stage.appendChild(card('Put a copy back', null, [
      el('p', { text: 'Choose a backup file. Everything on screen is replaced by it — nothing reaches the '
                    + 'website until you publish afterwards.' }),
      restore
    ]));

    stage.appendChild(card('Start again', null, [
      el('p', { text: 'Returns every setting to the way the website was built. Your published website is '
                    + 'untouched until you publish again.' }),
      el('button', {
        class: 'btn btn-danger', type: 'button', text: 'Reset every setting',
        onclick: function () {
          if (!window.confirm('Put every setting back to the original? Anything not published will be lost.')) return;
          draft = clone(DEFAULTS);
          saveDraft();
          logEntry('Reset every setting');
          toast('Everything reset', 'good');
          render();
        }
      })
    ]));
  }, true);

  // ---- Activity (Super Admin) ---------------------------------------------
  section('activity', 'Activity', 'Super Admin', '☰', function (stage) {
    stage.appendChild(head('Activity',
      'What has been done in the panels from this browser.'));

    var entries = readLog();

    stage.appendChild(el('div', { class: 'note' }, [
      el('strong', { text: 'This is a record for this computer only.' }),
      'It is kept in this browser, so it does not show work done on another machine, and clearing the '
      + 'browser\'s data removes it. A record that covers everybody needs the server-based panel in the '
      + 'backend folder.'
    ]));

    if (!entries.length) {
      stage.appendChild(el('div', { class: 'empty' }, [
        el('strong', { text: 'Nothing recorded yet' }),
        'Sign-ins, publishing and changes to pictures and passwords appear here.'
      ]));
      return;
    }

    stage.appendChild(card('Record', entries.length + ' entries', [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'When' }), el('th', { text: 'Who' }), el('th', { text: 'What' })
        ])]),
        el('tbody', {}, entries.map(function (entry) {
          return el('tr', {}, [
            el('td', { class: 'mono', text: new Date(entry.at).toLocaleString() }),
            el('td', { text: entry.who }),
            el('td', { text: entry.what })
          ]);
        }))
      ]),
      el('button', {
        class: 'btn btn-danger btn-sm', type: 'button', text: 'Clear the record', style: 'margin-top:14px',
        onclick: function () {
          if (!window.confirm('Clear the activity record?')) return;
          try { window.localStorage.removeItem(LOG_KEY); } catch (e) { /* ignore */ }
          render();
        }
      })
    ]));
  }, true);

  // ---- Help ---------------------------------------------------------------
  section('help', 'Help', 'Website', '?', function (stage) {
    stage.appendChild(head('Help',
      'How this panel fits together with the website and your web host.'));

    stage.appendChild(card('The idea in one paragraph', null, [
      el('p', { text: 'Your website is a folder of files on a web host. There is no database and no program '
        + 'running behind it — which is why it never breaks, and why it cannot save anything by itself. '
        + 'This panel does the editing in your browser and writes the result into one small file. Uploading '
        + 'that file is what publishes the change.' })
    ]));

    stage.appendChild(card('Where things live', null, [
      el('table', {}, [
        el('tbody', {}, [
          ['Everything in this panel', 'assets/js/content.js'],
          ['Who may sign in', 'assets/js/panel-auth.js'],
          ['Pictures you upload yourself', 'assets/img/'],
          ['PDFs for the downloads page', 'assets/files/'],
          ['The pages themselves', 'index.html, about.html, and so on']
        ].map(function (row) {
          return el('tr', {}, [el('td', { text: row[0] }), el('td', {}, [el('code', { text: row[1] })])]);
        }))
      ])
    ]));

    stage.appendChild(card('If something looks wrong', null, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'What you see' }), el('th', { text: 'What to do' })])]),
        el('tbody', {}, [
          ['The website has not changed', 'content.js has not been uploaded yet, or it landed in the wrong folder. It belongs at assets/js/content.js.'],
          ['Still the old version', 'Refresh with Ctrl+F5, or open the site in a private window.'],
          ['Pictures missing on the site', 'If you typed a path instead of choosing a file, check the picture is really at that path on the host.'],
          ['The panel forgot my work', 'The draft is kept in this browser. A different browser, or a private window, starts fresh. Use Backup to move settings between computers.'],
          ['Lettering looks ordinary', 'The downloaded typefaces need a connection. The site stays readable without them.']
        ].map(function (row) {
          return el('tr', {}, [el('td', { text: row[0] }), el('td', { text: row[1] })]);
        }))
      ]),
      el('p', { style: 'margin-top:14px' }, [
        'There is also a self-test page at ',
        el('code', { text: 'yourdomain.com/check.html' }),
        ' which reports what is missing from an upload.'
      ])
    ]));
  });

  // =========================================================================
  // 10. Publishing and preview
  // =========================================================================

  function doPublish() {
    var text = contentFile();
    download('content.js', text, 'application/javascript');
    try { window.localStorage.setItem(PUBLISHED_KEY, fingerprint(published())); } catch (e) { /* ignore */ }
    logEntry('Published content.js (' + readableSize(bytesOf(text)) + ')');
    toast('Downloaded. Now upload it to assets/js/ on your host.', 'good');
    refreshDocket();
    if (currentSection === 'publish' || currentSection === 'overview') render();
  }

  function copyText(text, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast(message, 'good'); },
        function () { toast('The browser would not allow copying. Use the download button.', 'bad'); }
      );
    } else {
      toast('This browser cannot copy from a page. Use the download button.', 'bad');
    }
  }

  function openPreview() {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (e) {
      toast('The preview needs to save a draft first, and this browser\'s storage is full.', 'bad');
      return;
    }
    window.open('../../index.html?preview=1', '_blank');
  }

  // =========================================================================
  // 11. Frame
  // =========================================================================

  function refreshDocket() {
    var docket = byId('docket');
    if (!docket) return;
    var changed = fingerprint(published()) !== publishedFingerprint();
    var size = bytesOf(contentFile());

    clear(docket);
    docket.appendChild(el('span', {
      class: 'stamp ' + (changed ? 'pending' : 'done'),
      text: changed ? 'Not published' : 'Published'
    }));
    docket.appendChild(el('div', { class: 'figures' }, [
      changed ? 'Waiting to be uploaded' : 'Matches your last download',
      el('br'),
      el('strong', { text: readableSize(size) }),
      ' · content.js'
    ]));
    docket.appendChild(el('span', { class: 'sp' }));
    docket.appendChild(el('div', { class: 'actions' }, [
      el('button', { class: 'btn btn-quiet', type: 'button', text: '↗ Preview', onclick: openPreview }),
      el('button', { class: 'btn btn-accent', type: 'button', text: '⬇ Download content.js', onclick: doPublish })
    ]));
  }

  function visibleSections() {
    return SECTIONS.filter(function (item) { return role === 'super' || !item.superOnly; });
  }

  function buildRail() {
    var rail = byId('rail');
    clear(rail);

    rail.appendChild(el('div', { class: 'rail-head' }, [
      el('span', { class: 'rail-badge', text: role === 'super' ? 'Super Admin' : 'Admin' }),
      el('h1', { text: draft.orgName }),
      el('p', { text: account ? 'Signed in as ' + account.name : '' })
    ]));

    var nav = el('nav', { class: 'rail-nav', 'aria-label': 'Sections' });
    var lastGroup = '';
    visibleSections().forEach(function (item) {
      if (item.group !== lastGroup) {
        nav.appendChild(el('p', { class: 'group', text: item.group }));
        lastGroup = item.group;
      }
      var counts = {
        banners: (draft.banners || []).length,
        pictures: (draft.pictures || []).length
      };
      nav.appendChild(el('button', {
        type: 'button', 'aria-current': String(item.id === currentSection),
        onclick: function () { currentSection = item.id; render(); }
      }, [
        el('span', { 'aria-hidden': 'true', text: item.icon }),
        item.label,
        counts[item.id] ? el('span', { class: 'tag', text: String(counts[item.id]) }) : null
      ]));
    });
    rail.appendChild(nav);

    rail.appendChild(el('div', { class: 'rail-foot' }, [
      el('a', { href: '../../index.html', target: '_blank', text: '↗ Open the website' }),
      role === 'super'
        ? el('a', { href: '../../adminpanel/login/', text: '→ Admin Panel' })
        : el('a', { href: '../../superadminpanel/login/', text: '→ Super Admin Panel' }),
      el('button', { type: 'button', text: 'Sign out', onclick: signOut })
    ]));
  }

  function render() {
    buildRail();
    var stage = byId('stage');
    clear(stage);
    var match = visibleSections().filter(function (item) { return item.id === currentSection; })[0]
             || visibleSections()[0];
    currentSection = match.id;
    match.build(stage);
    stage.scrollTop = 0;
    window.scrollTo(0, 0);
    refreshDocket();
  }

  // =========================================================================
  // 12. Sign-in
  // =========================================================================

  function attemptState() {
    try { return JSON.parse(window.sessionStorage.getItem(ATTEMPT_KEY) || '{"count":0,"until":0}'); }
    catch (e) { return { count: 0, until: 0 }; }
  }
  function setAttempts(state) {
    try { window.sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function startSession(matched) {
    account = matched;
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        id: matched.id, role: matched.role, name: matched.name, at: Date.now()
      }));
    } catch (e) { /* the panel still works, it just will not survive a refresh */ }
    setAttempts({ count: 0, until: 0 });
    logEntry('Signed in to the ' + (role === 'super' ? 'Super Admin Panel' : 'Admin Panel'));

    byId('gate').hidden = true;
    byId('console').hidden = false;
    byId('docket').hidden = false;
    render();
    resetIdle();
  }

  function resumeSession() {
    try {
      var saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!saved || saved.role !== role) return false;
      var minutes = (Date.now() - saved.at) / 60000;
      if (minutes > (auth().idleMinutes || 30)) return false;
      account = saved;
      return true;
    } catch (e) { return false; }
  }

  function signOut() {
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    logEntry('Signed out');
    account = null;
    window.location.reload();
  }

  function resetIdle() {
    clearTimeout(idleTimer);
    var minutes = auth().idleMinutes || 30;
    idleTimer = setTimeout(function () {
      try { window.sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
      window.alert('The panel has been left unattended for ' + minutes + ' minutes and has signed you out. '
                 + 'Anything you had not published is still saved in this browser.');
      window.location.reload();
    }, minutes * 60000);
    try {
      var saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
      if (saved) { saved.at = Date.now(); window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved)); }
    } catch (e) { /* ignore */ }
  }

  function buildGate() {
    var gate = byId('gate');
    var settings = auth();
    var mine = (settings.accounts || []).filter(function (item) { return item.role === role; });

    var password = el('input', { type: 'password', id: 'gate-pw', autocomplete: 'current-password',
                                 autofocus: true, 'aria-describedby': 'gate-help' });
    var error = el('div', { class: 'gate-error', hidden: true, role: 'alert' });
    var submit = el('button', { class: 'btn btn-accent btn-wide', type: 'submit', text: 'Sign in' });

    function fail(message) {
      error.hidden = false;
      error.textContent = message;
      submit.disabled = false;
      submit.textContent = 'Sign in';
      password.value = '';
      password.focus();
    }

    function tryPassword(event) {
      event.preventDefault();
      var state = attemptState();
      if (state.until > Date.now()) {
        fail('Too many attempts. Wait ' + Math.ceil((state.until - Date.now()) / 1000) + ' seconds.');
        return;
      }
      if (!password.value) { fail('Type the password.'); return; }
      if (!mine.length) { fail('No account is set up for this panel. Check that assets/js/panel-auth.js uploaded.'); return; }

      error.hidden = true;
      submit.disabled = true;
      submit.textContent = 'Checking…';

      var candidate = mine[0];
      derive(password.value, candidate.salt, settings.iterations || 100000).then(function (hash) {
        if (sameHash(hash, candidate.hash)) {
          startSession(candidate);
          return;
        }
        var next = attemptState();
        next.count = (next.count || 0) + 1;
        if (next.count >= (settings.lockAfterAttempts || 5)) {
          next.until = Date.now() + (settings.lockSeconds || 60) * 1000;
          next.count = 0;
          setAttempts(next);
          logEntry('Sign-in paused after repeated wrong passwords');
          fail('That password is wrong. The box is paused for ' + (settings.lockSeconds || 60) + ' seconds.');
          return;
        }
        setAttempts(next);
        fail('That password is wrong.');
      });
    }

    var form = el('form', { onsubmit: tryPassword, autocomplete: 'off' }, [
      error,
      el('div', { class: 'field' }, [
        el('label', { for: 'gate-pw', text: 'Password' }),
        password
      ]),
      submit
    ]);

    clear(gate);
    gate.appendChild(el('div', { class: 'gate-card' }, [
      el('div', { class: 'gate-mark', text: role === 'super' ? '⬢' : '🔑' }),
      el('h1', { text: role === 'super' ? 'Super Admin Panel' : 'Admin Panel' }),
      el('p', { class: 'role-line', text: role === 'super' ? 'Website · administrators · passwords' : 'Website content and appearance' }),
      form,
      el('div', { class: 'gate-note', id: 'gate-help' }, [
        el('p', { style: 'margin:0 0 8px' }, [
          'This lock is in the page, not on the server. It keeps the panel closed to anyone who finds the '
          + 'address, and the password is stored only as a hash that cannot be read back. To have the server '
          + 'refuse these pages outright, the Super Admin Panel has a Server lock section that sets it up.'
        ]),
        el('a', { href: '../../index.html', text: '← Back to the website' })
      ])
    ]));
  }

  // =========================================================================
  // 13. Start
  // =========================================================================

  function start(options) {
    role = (options && options.role) === 'super' ? 'super' : 'admin';
    document.body.setAttribute('data-role', role);
    document.title = (role === 'super' ? 'Super Admin Panel' : 'Admin Panel') + ' — Club Website';

    draft = loadDraft();

    if (!window.CLUB_PANEL_AUTH) {
      byId('gate').appendChild(el('div', { class: 'gate-card' }, [
        el('h1', { text: 'Sign-in file missing' }),
        el('p', { text: 'The panel cannot check a password because assets/js/panel-auth.js did not load. '
                      + 'Upload it to your host, in the assets/js folder, alongside content.js.' }),
        el('a', { class: 'btn btn-quiet', href: '../../index.html', text: '← Back to the website' })
      ]));
      return;
    }

    buildGate();

    if (resumeSession()) {
      byId('gate').hidden = true;
      byId('console').hidden = false;
      byId('docket').hidden = false;
      render();
      resetIdle();
    }

    ['click', 'keydown'].forEach(function (name) {
      document.addEventListener(name, function () { if (account) resetIdle(); }, true);
    });

    window.addEventListener('beforeunload', function (event) {
      if (!account) return;
      if (fingerprint(published()) === publishedFingerprint()) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  return { start: start };
})();
