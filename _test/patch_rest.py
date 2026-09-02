#!/usr/bin/env python3
"""Finish wiring: index.htm, the content.js template, and the self-test page."""

import pathlib

SITE = pathlib.Path("/home/claude/work/frontend/website")

CONTENT_TAG = '<script src="assets/js/content.js"></script>'
THEME_TAG = '<script src="assets/js/theme.js"></script>'

OLD_PLAY = """    function play() {
      var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (motion.matches) return;                 // respect the visitor's setting
      stop();
      timer = setInterval(function () { show(index + 1); }, 6000);
    }"""

NEW_PLAY = """    function play() {
      var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (motion.matches) return;                 // respect the visitor's setting
      // The Admin Panel can turn the automatic change off, or slow it down.
      if (slider.getAttribute('data-autoplay') === 'off') return;
      var wait = parseInt(slider.getAttribute('data-interval'), 10);
      if (!isFinite(wait) || wait < 2000) wait = 6000;
      stop();
      timer = setInterval(function () { show(index + 1); }, wait);
    }"""

# ---- 1. index.htm, the copy for hosts that default to .htm -------------------
p = SITE / "index.htm"
t = p.read_text(encoding="utf-8")
if CONTENT_TAG in t and THEME_TAG not in t:
    t = t.replace(CONTENT_TAG, CONTENT_TAG + "\n" + THEME_TAG, 1)
if OLD_PLAY in t:
    t = t.replace(OLD_PLAY, NEW_PLAY)
p.write_text(t, encoding="utf-8")
print("index.htm      :", "theme" if THEME_TAG in t else "MISSING theme",
      "|", "slider" if "data-autoplay" in t else "MISSING slider")

# ---- 2. The self-test page ---------------------------------------------------
p = SITE / "check.html"
t = p.read_text(encoding="utf-8")

if 'id="r-theme"' not in t:
    old_rows = """      <tr><td>Bare domain opens the home page</td>
          <td id="r-root" class="wait">checking…</td><td class="fix" id="n-root"></td></tr>
      <tr><td>Backend (admin panels)</td>"""
    new_rows = """      <tr><td>Bare domain opens the home page</td>
          <td id="r-root" class="wait">checking…</td><td class="fix" id="n-root"></td></tr>
      <tr><td>Settings <code>assets/js/content.js</code></td>
          <td id="r-content" class="wait">checking…</td><td class="fix" id="n-content"></td></tr>
      <tr><td>Appearance <code>assets/js/theme.js</code></td>
          <td id="r-theme" class="wait">checking…</td><td class="fix" id="n-theme"></td></tr>
      <tr><td>Admin Panel <code>/adminpanel/login/</code></td>
          <td id="r-panel" class="wait">checking…</td><td class="fix" id="n-panel"></td></tr>
      <tr><td>Sign-in <code>assets/js/panel-auth.js</code></td>
          <td id="r-auth" class="wait">checking…</td><td class="fix" id="n-auth"></td></tr>
      <tr><td>Backend (server-based panels)</td>"""
    assert old_rows in t, "check.html rows anchor not found"
    t = t.replace(old_rows, new_rows, 1)

    old_checks = """  check('home', 'index.html', 'Found.',
        'Not found — this is why the bare domain shows "Page not found". Upload index.html.');"""
    new_checks = old_checks + """
  check('content', 'assets/js/content.js',
        'Found. Anything published from the Admin Panel is being applied.',
        'Not found. Publish once from the Admin Panel and upload the file it writes; until '
        + 'then the pages show the text built into them.');
  check('theme', 'assets/js/theme.js',
        'Found. Banners, typefaces, colours, logo, header and footer are being applied.',
        'Not found. Upload it — without it the panels can still change the wording, but not '
        + 'the appearance.');
  check('panel', 'adminpanel/login/index.html',
        'Found. The Admin Panel will open.',
        'Not found. Upload the adminpanel folder.');
  check('auth', 'assets/js/panel-auth.js',
        'Found. The panels can check a password.',
        'Not found. Upload it, or neither panel will let anyone in.');"""
    assert old_checks in t, "check.html checks anchor not found"
    t = t.replace(old_checks, new_checks, 1)

    old_keys = "    var keys = ['css', 'js', 'img', 'home', 'root'];"
    new_keys = "    var keys = ['css', 'js', 'img', 'home', 'root', 'content', 'theme', 'panel', 'auth'];"
    assert old_keys in t
    t = t.replace(old_keys, new_keys, 1)

    old_fail = "    var failed = keys.filter(function (k) { return !results[k]; });"
    new_fail = ("    // content.js only exists after the first publish, so its absence is not a fault.\n"
                "    var failed = keys.filter(function (k) { return k !== 'content' && !results[k]; });")
    assert old_fail in t
    t = t.replace(old_fail, new_fail, 1)

    old_verdict = """      if (!results.css || !results.js || !results.img) {
        advice.push('The <code>assets</code> folder is missing. The pages will still display '
          + 'correctly because the design is built into each one, but upload it so the '
          + 'photographs appear.');
      }"""
    new_verdict = old_verdict + """
      if (results.css && !results.theme) {
        advice.push('<code>assets/js/theme.js</code> did not arrive. The banners, typefaces, '
          + 'colours and logo set in the Admin Panel need it — upload it into '
          + '<code>assets/js/</code>.');
      }
      if (!results.auth) {
        advice.push('<code>assets/js/panel-auth.js</code> did not arrive, so neither admin '
          + 'panel can check a password. Upload it into <code>assets/js/</code>.');
      }"""
    assert old_verdict in t
    t = t.replace(old_verdict, new_verdict, 1)

    old_api = """        'No backend on this domain. Expected on plain hosting — the website itself is '
        + 'unaffected, but the two admin panel links will show a 404.';"""
    new_api = """        'No backend on this domain. This is the ordinary case on shared hosting, and nothing '
        + 'is wrong: both admin panels run in the browser and work without one.';"""
    assert old_api in t
    t = t.replace(old_api, new_api, 1)

    p.write_text(t, encoding="utf-8")

print("check.html     :", "updated" if 'id="r-theme"' in t else "MISSING")
