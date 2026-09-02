#!/usr/bin/env python3
"""Wire the appearance engine into every page of the website."""

import pathlib
import sys

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

report = {"theme": [], "slider": [], "skipped": []}

targets = sorted(SITE.glob("*.html")) + [SITE / "assets" / "js" / "site.js"]

for path in targets:
    text = path.read_text(encoding="utf-8")
    original = text

    # 1. Load theme.js straight after content.js, so it can rebuild the slider
    #    before site.js starts it.
    if path.suffix == ".html":
        if CONTENT_TAG in text and THEME_TAG not in text:
            text = text.replace(CONTENT_TAG, CONTENT_TAG + "\n" + THEME_TAG, 1)
            report["theme"].append(path.name)
        elif CONTENT_TAG not in text:
            report["skipped"].append(path.name)

    # 2. Let the banner timing be set from the panel.
    if OLD_PLAY in text:
        text = text.replace(OLD_PLAY, NEW_PLAY)
        report["slider"].append(path.name)

    if text != original:
        path.write_text(text, encoding="utf-8")

print("theme.js added to :", len(report["theme"]), "pages")
for name in report["theme"]:
    print("   +", name)
print("slider updated in :", len(report["slider"]), "files ->", ", ".join(report["slider"]))
if report["skipped"]:
    print("no content.js tag :", ", ".join(report["skipped"]))
