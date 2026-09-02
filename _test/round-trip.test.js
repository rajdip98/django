/* ---------------------------------------------------------------------------
   The round trip.

   Signs in to the panel, changes settings through the panel's own code, takes
   the content.js it would hand you, writes that file to the site, and loads the
   real pages to see the change.

   This is the join the other two tests do not cover: the panel could write a
   perfectly good file in a shape the pages do not read, and both would pass
   their own tests while the website never changed.
   --------------------------------------------------------------------------- */

const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');
const http = require('http');

const SITE = path.join(__dirname, '..', 'frontend', 'website');
const CONTENT = path.join(SITE, 'assets', 'js', 'content.js');
const BACKUP = CONTENT + '.roundtripbackup';

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${!condition && detail ? '  <- ' + detail : ''}`);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.svg': 'image/svg+xml', '.htm': 'text/html' };

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const clean = decodeURIComponent(req.url.split('?')[0]);
      const target = path.join(SITE, clean);
      if (!target.startsWith(SITE) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
      res.end(fs.readFileSync(target));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function shim(window) {
  window.matchMedia = q => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; }
  });
  window.scrollTo = () => {};

  /* Capture the download instead of performing it. This is how the published
     file is obtained without a real browser save dialogue. */
  window.__published = null;
  window.URL.createObjectURL = blob => {
    blob.text().then(text => { window.__published = text; });
    return 'blob:captured';
  };
  window.URL.revokeObjectURL = () => {};
}

async function open(origin, page) {
  const dom = await JSDOM.fromURL(`${origin}/${page}`, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse: shim
  });
  await new Promise(resolve => {
    if (dom.window.document.readyState === 'complete') return setTimeout(resolve, 300);
    dom.window.addEventListener('load', () => setTimeout(resolve, 300));
  });
  return dom;
}

async function signIn(dom, password) {
  const doc = dom.window.document;
  const field = doc.getElementById('gate-pw');
  const form = doc.querySelector('#gate form');
  field.value = password;
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (!doc.getElementById('console').hidden) return true;
  }
  return false;
}

function goToSection(dom, name) {
  const buttons = [...dom.window.document.querySelectorAll('#rail button, #rail a')];
  const target = buttons.find(b => b.textContent.trim().includes(name));
  if (!target) return false;
  target.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  return true;
}

function typeInto(dom, id, value) {
  const field = dom.window.document.getElementById(id);
  if (!field) return false;
  field.value = value;
  field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  field.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  return true;
}

(async () => {
  fs.copyFileSync(CONTENT, BACKUP);
  const server = await serve();
  const origin = 'http://127.0.0.1:' + server.address().port;

  try {
    console.log('\n=== EDIT IN THE SUPER ADMIN PANEL ===');
    const panel = await open(origin, 'superadminpanel/login/index.html');
    check('signed in with rajdip@2007', await signIn(panel, 'rajdip@2007'));

    check('opened "Name and logo"', goToSection(panel, 'Name and logo'));
    await new Promise(r => setTimeout(r, 200));

    const NAME = 'Tripura Robotics Society';
    check('typed a new club name', typeInto(panel, 'f-orgname', NAME));
    typeInto(panel, 'f-tagline', 'Building things in Agartala since 2024');
    await new Promise(r => setTimeout(r, 200));

    check('opened "Banners"', goToSection(panel, 'Banners'));
    await new Promise(r => setTimeout(r, 200));
    const bannerTyped = typeInto(panel, 'b-title-0', 'Line-follower contest');
    check('changed the first banner heading', bannerTyped);
    await new Promise(r => setTimeout(r, 200));

    // Publish: find and press the download button.
    check('opened "Publish"', goToSection(panel, 'Publish'));
    await new Promise(r => setTimeout(r, 300));

    const doc = panel.window.document;
    const publishButton = [...doc.querySelectorAll('#stage button')]
      .find(b => b.textContent.includes('content.js'));
    check('found the Download content.js button', !!publishButton);

    publishButton.dispatchEvent(new panel.window.Event('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));

    const file = panel.window.__published;
    check('the panel produced a file', typeof file === 'string' && file.length > 0);
    check('the file declares window.CLUB_CONTENT', file && file.includes('window.CLUB_CONTENT ='));
    check('the file carries the new name', file && file.includes(NAME));
    check('the file carries the new banner heading', file && file.includes('Line-follower contest'));

    panel.window.close();

    // Publish it exactly as an administrator would, then load the site.
    console.log('\n=== UPLOAD IT AND LOAD THE WEBSITE ===');
    fs.writeFileSync(CONTENT, file);

    check('the published file is valid JavaScript', (() => {
      try { new Function(file); return true; } catch (e) { return false; }
    })());

    const site = await open(origin, 'index.html');
    const sdoc = site.window.document;

    check('the new name is on the home page',
      sdoc.querySelector('.masthead .titles h1').textContent.includes(NAME));
    check('the new tagline is on the home page',
      sdoc.querySelector('.masthead .titles p').textContent.includes('Building things in Agartala'));
    check('the new banner heading is on the home page',
      sdoc.querySelector('[data-slider]').textContent.includes('Line-follower contest'));
    check('the name reached the footer',
      sdoc.querySelector('.site-footer').textContent.includes(NAME));
    check('the name reached the page title', sdoc.title.includes(NAME));
    site.window.close();

    // And on a second page, since content.js is shared.
    const other = await open(origin, 'about.html');
    check('the new name is on about.html',
      other.window.document.querySelector('.masthead .titles h1').textContent.includes(NAME));
    other.window.close();

  } finally {
    fs.copyFileSync(BACKUP, CONTENT);
    fs.unlinkSync(BACKUP);
    server.close();
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : failures + ' CHECK(S) FAILED.'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
