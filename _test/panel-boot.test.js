/* ---------------------------------------------------------------------------
   Boots each panel page in a real DOM, types the password at the sign-in box,
   and checks that the console appears with the sections that role should have.

   This is the test that would have caught the original fault: the panels were
   never opened after the engine was written, so nobody noticed the pages did
   not load it.
   --------------------------------------------------------------------------- */

const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');
const http = require('http');

const SITE = path.join(__dirname, '..', 'frontend', 'website');

/* A minimal static server. jsdom resolves ../../assets/... against the page's
   URL, so the files have to be reachable over http for the test to mean
   anything. It also gives localStorage a real origin to attach to. */
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

const CASES = [
  {
    role: 'admin',
    page: 'adminpanel/login/index.html',
    password: 'rajdip@10',
    wrong: 'rajdip@2007',
    mustHave: ['Name and logo', 'Banners', 'Typefaces', 'Header and menu', 'Footer', 'Photographs', 'Publish'],
    mustNotHave: ['Administrators', 'Server lock', 'Activity']
  },
  {
    role: 'super',
    page: 'superadminpanel/login/index.html',
    password: 'rajdip@2007',
    wrong: 'rajdip@10',
    mustHave: ['Name and logo', 'Banners', 'Typefaces', 'Header and menu', 'Footer', 'Photographs',
               'Publish', 'Administrators', 'Server lock', 'Backup', 'Activity'],
    mustNotHave: []
  }
];

let failures = 0;
function check(label, condition, detail) {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  ${mark}  ${label}${!condition && detail ? '  <- ' + detail : ''}`);
}

async function boot(testCase, origin) {
  const dom = await JSDOM.fromURL(origin + '/' + testCase.page, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });

  // Wait for the external scripts to load and ClubPanel.start() to run.
  await new Promise(resolve => {
    if (dom.window.document.readyState === 'complete') return setTimeout(resolve, 250);
    dom.window.addEventListener('load', () => setTimeout(resolve, 250));
  });

  return dom;
}

async function signIn(dom, password) {
  const doc = dom.window.document;
  const field = doc.getElementById('gate-pw');
  const form = doc.querySelector('#gate form');
  if (!field || !form) return { ok: false, why: 'no sign-in box was built' };

  field.value = password;
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  // PBKDF2 at 100k iterations takes a moment, even via WebCrypto.
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (!doc.getElementById('console').hidden) return { ok: true };
  }
  return { ok: false, why: 'console never appeared' };
}

(async () => {
  const server = await serve();
  const origin = 'http://127.0.0.1:' + server.address().port;
  console.log('serving ' + SITE + ' at ' + origin);

  for (const testCase of CASES) {
    console.log(`\n=== ${testCase.role.toUpperCase()} PANEL — ${testCase.page} ===`);

    const dom = await boot(testCase, origin);
    const doc = dom.window.document;
    const errors = [];
    dom.window.addEventListener('error', e => errors.push(e.message));

    check('engine loaded (window.ClubPanel)', typeof dom.window.ClubPanel === 'object');
    check('sign-in file loaded (CLUB_PANEL_AUTH)', typeof dom.window.CLUB_PANEL_AUTH === 'object');
    check('sign-in box was built', !!doc.getElementById('gate-pw'));
    check('console starts hidden', doc.getElementById('console').hidden === true);

    // Wrong password must not let anyone in.
    const bad = await (async () => {
      const field = doc.getElementById('gate-pw');
      const form = doc.querySelector('#gate form');
      if (!field || !form) return false;
      field.value = testCase.wrong;
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 4000));
      return doc.getElementById('console').hidden === true;
    })();
    check(`the other panel's password is rejected`, bad);

    // Correct password must let them in.
    const result = await signIn(dom, testCase.password);
    check(`"${testCase.password}" signs in`, result.ok, result.why);

    if (result.ok) {
      const railText = doc.getElementById('rail').textContent;
      testCase.mustHave.forEach(name =>
        check(`section present: ${name}`, railText.includes(name)));
      testCase.mustNotHave.forEach(name =>
        check(`section correctly hidden: ${name}`, !railText.includes(name)));

      check('working stage has content', doc.getElementById('stage').children.length > 0);
      check('despatch docket is showing', doc.getElementById('docket').hidden === false);
      check('rail names the role',
        doc.getElementById('rail').textContent.includes(
          testCase.role === 'super' ? 'Super Admin' : 'Admin'));
    }

    check('no uncaught script errors', errors.length === 0, errors.join('; '));
    dom.window.close();
  }

  server.close();
  console.log(`\n${failures === 0 ? 'All checks passed.' : failures + ' CHECK(S) FAILED.'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
