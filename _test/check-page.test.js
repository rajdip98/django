/* ---------------------------------------------------------------------------
   check.html is the page an administrator opens when something looks wrong, so
   it has to be right about what is missing. This loads it twice: once against a
   complete upload, once with the panel engine deliberately withheld.
   --------------------------------------------------------------------------- */

const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');
const http = require('http');

const SITE = path.join(__dirname, '..', 'frontend', 'website');

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${!condition && detail ? '  <- ' + detail : ''}`);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.svg': 'image/svg+xml', '.htm': 'text/html' };

/* `hide` names files the server should pretend are not there, so an incomplete
   upload can be simulated without deleting anything. */
function serve(hide) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const clean = decodeURIComponent(req.url.split('?')[0]);
      if (hide.some(h => clean.endsWith(h))) { res.writeHead(404); res.end('withheld'); return; }
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

async function run(hide) {
  const server = await serve(hide);
  const origin = 'http://127.0.0.1:' + server.address().port;
  const dom = await JSDOM.fromURL(origin + '/check.html', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      /* jsdom does not expose fetch on the window. check.html uses it to ask
         the server for each file, so hand it Node's, resolving relative paths
         against this origin the way a browser would. */
      w.fetch = (input, init) => {
        const url = typeof input === 'string' ? new URL(input, origin).href : input;
        return fetch(url, init);
      };
    }
  });
  await new Promise(resolve => dom.window.addEventListener('load', () => setTimeout(resolve, 2500)));
  const text = dom.window.document.body.textContent;
  const cells = {};
  ['css', 'js', 'img', 'content', 'theme', 'panel', 'superpanel', 'core', 'panelcss', 'auth']
    .forEach(k => {
      const cell = dom.window.document.getElementById('r-' + k);
      cells[k] = cell ? cell.textContent.trim() : '(no such row)';
    });
  dom.window.close();
  server.close();
  return { text, cells };
}

(async () => {
  console.log('\n=== A COMPLETE UPLOAD ===');
  const good = await run([]);
  Object.keys(good.cells).forEach(k =>
    check(`${k}: reported as found`, good.cells[k] === 'PASS', 'reported "' + good.cells[k] + '"'));

  console.log('\n=== WITH panel-core.js AND panel.css MISSING ===');
  const bad = await run(['/assets/js/panel-core.js', '/assets/css/panel.css']);
  check('panel-core.js reported missing', bad.cells.core !== 'PASS',
    'reported "' + bad.cells.core + '"');
  check('panel.css reported missing', bad.cells.panelcss !== 'PASS',
    'reported "' + bad.cells.panelcss + '"');
  check('the advice names panel-core.js', bad.text.includes('panel-core.js'));
  check('the advice names panel.css', bad.text.includes('panel.css'));
  check('files that did arrive are still reported found', bad.cells.auth === 'PASS');

  console.log(`\n${failures === 0 ? 'All checks passed.' : failures + ' CHECK(S) FAILED.'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
