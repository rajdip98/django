/* ---------------------------------------------------------------------------
   Publishes a content.js the way the panel would, then loads the real pages and
   checks the change actually reached them.

   The panel producing a correct file is only half the job — the file has to be
   read by every page. This test covers the second half.
   --------------------------------------------------------------------------- */

const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');
const http = require('http');

const SITE = path.join(__dirname, '..', 'frontend', 'website');
const CONTENT = path.join(SITE, 'assets', 'js', 'content.js');
const BACKUP = CONTENT + '.testbackup';

/* A 2x2 red PNG — enough to prove a picture travels from the file to the page. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91J' +
            'pzAAAAEUlEQVR4nGP8z4APMOGVHfHSAB54AR8UJEmyAAAAAElFTkSuQmCC';

const SETTINGS = {
  orgName: 'Agartala Maker Club',
  shortName: 'AMC',
  tagline: 'Electronics \u00b7 Software \u00b7 Community',
  established: '2024',
  phone: '+91 381 555 0199',
  email: 'hello@agartalamakers.org',

  logo: { src: PNG, alt: 'Agartala Maker Club emblem', size: 72, shape: 'circle', fit: 'contain' },

  fonts: {
    headingFamily: '"Playfair Display", Georgia, serif',
    bodyFamily: '"Hind Siliguri", sans-serif',
    scale: 105,
    headingWeight: 800
  },

  theme: { accent: '#e0532f', primary: '#12233d', page: '#f7f4ef' },

  banners: [
    { title: 'Robotics workshop', text: 'Six Saturdays, open to all.', image: PNG,
      eyebrow: 'Programmes', primaryText: 'Enrol', primaryHref: 'contact.html' },
    { title: 'ESP32 night', text: 'Bring a board.', image: PNG },
    { title: 'Annual exhibition', text: 'Projects from every member.' }
  ],

  bannerSettings: { height: 420 },

  header: { topStripText: 'Registered Society \u00b7 Tripura' },

  footer: { about: 'A maker club in Agartala.', copyright: '\u00a9 2026 Agartala Maker Club' },

  notices: [
    { text: 'Workshop registrations close on 30 September', href: 'events.html' }
  ]
};

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

async function load(origin, page) {
  const dom = await JSDOM.fromURL(`${origin}/${page}`, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(window) {
      /* jsdom has no matchMedia. The pages ask it about prefers-reduced-motion
         before starting the slider, so supply a plain answer. */
      window.matchMedia = q => ({
        matches: false, media: q, onchange: null,
        addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; }
      });
      window.scrollTo = () => {};
    }
  });
  await new Promise(resolve => {
    if (dom.window.document.readyState === 'complete') return setTimeout(resolve, 300);
    dom.window.addEventListener('load', () => setTimeout(resolve, 300));
  });
  return dom;
}

(async () => {
  fs.copyFileSync(CONTENT, BACKUP);
  fs.writeFileSync(CONTENT,
    '/* written by the test */\nwindow.CLUB_CONTENT = ' + JSON.stringify(SETTINGS, null, 2) + ';\n');

  const server = await serve();
  const origin = 'http://127.0.0.1:' + server.address().port;

  try {
    console.log('\n=== HOME PAGE (index.html) ===');
    const dom = await load(origin, 'index.html');
    const doc = dom.window.document;
    const root = doc.documentElement;

    // Name
    check('club name reached the masthead',
      doc.querySelector('.masthead .titles h1').textContent.includes('Agartala Maker Club'));
    check('tagline reached the masthead',
      doc.querySelector('.masthead .titles p').textContent.includes('Electronics'));
    check('name reached the page title', doc.title.includes('Agartala Maker Club'));

    // Logo
    const emblem = doc.querySelector('.masthead .emblem');
    check('logo replaced the built-in emblem', emblem && emblem.tagName === 'IMG',
      emblem ? 'still a ' + emblem.tagName : 'no emblem at all');
    check('logo uses the uploaded picture', emblem && emblem.src === PNG);
    check('logo alt text applied', emblem && emblem.alt.includes('Agartala'));
    check('logo shape applied', emblem && emblem.style.borderRadius === '50%');

    // Fonts
    check('heading typeface applied',
      root.style.getPropertyValue('--serif').includes('Playfair'));
    check('body typeface applied',
      root.style.getPropertyValue('--sans').includes('Hind Siliguri'));
    const themeCss = doc.querySelector('style[data-club-theme]');
    check('a theme stylesheet was written', !!themeCss);
    check('text scale applied', themeCss && themeCss.textContent.includes('font-size: 105%'));
    check('heading weight applied', themeCss && themeCss.textContent.includes('font-weight: 800'));

    // Colours
    check('accent colour applied',
      root.style.getPropertyValue('--gold').trim() === '#e0532f',
      'got "' + root.style.getPropertyValue('--gold') + '"');
    check('primary colour applied to both navy shades',
      root.style.getPropertyValue('--navy-800').trim() === '#12233d' &&
      root.style.getPropertyValue('--navy-900').trim() === '#12233d');
    check('page colour applied',
      root.style.getPropertyValue('--page').trim() === '#f7f4ef');

    // Banners
    const slides = doc.querySelectorAll('[data-slider] .slide');
    check('all three banners built', slides.length === 3, 'got ' + slides.length);
    check('first banner shows first', slides[0] && slides[0].classList.contains('on'));
    check('banner heading applied',
      slides[0] && slides[0].textContent.includes('Robotics workshop'));
    check('banner picture applied',
      slides[0] && slides[0].style.backgroundImage.includes('data:image/png'));
    check('banner without a picture still built',
      slides[2] && slides[2].textContent.includes('Annual exhibition'));
    check('banner height applied', themeCss && themeCss.textContent.includes('min-height: 420px'));

    const dots = doc.querySelectorAll('[data-slider] .slider-dots button');
    check('one dot per banner', dots.length === 3, 'got ' + dots.length);
    check('arrows rebuilt', doc.querySelectorAll('[data-slider] .slider-arrow').length === 2);

    // The page's own slider script must still drive the rebuilt slides.
    const next = doc.querySelector('.slider-arrow.next');
    next.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    check('the page script still drives the rebuilt slides',
      slides[1].classList.contains('on') && !slides[0].classList.contains('on'),
      'clicking next did not move the slider');

    // Header and footer
    check('top strip text applied',
      doc.querySelector('.topbar .wrap').textContent.includes('Registered Society'));
    check('footer text applied',
      doc.querySelector('.site-footer').textContent.includes('A maker club in Agartala'));

    // Notices
    check('notice reached the ticker',
      doc.querySelector('[data-content-notices]').textContent.includes('Workshop registrations'));

    dom.window.close();

    // A second page, to prove it is not just the home page.
    console.log('\n=== ANOTHER PAGE (contact.html) ===');
    const dom2 = await load(origin, 'contact.html');
    const doc2 = dom2.window.document;
    check('name applied here too',
      doc2.querySelector('.masthead .titles h1').textContent.includes('Agartala Maker Club'));
    check('logo applied here too',
      doc2.querySelector('.masthead .emblem').tagName === 'IMG');
    check('typeface applied here too',
      doc2.documentElement.style.getPropertyValue('--serif').includes('Playfair'));
    check('telephone applied here too',
      doc2.body.textContent.includes('+91 381 555 0199'));
    dom2.window.close();

    // With no settings at all the pages must still be correct.
    console.log('\n=== WITH AN EMPTY content.js ===');
    fs.writeFileSync(CONTENT, 'window.CLUB_CONTENT = {};\n');
    const dom3 = await load(origin, 'index.html');
    const doc3 = dom3.window.document;
    check('built-in name still shows',
      doc3.querySelector('.masthead .titles h1').textContent.trim().length > 0);
    check('built-in emblem still shows',
      doc3.querySelector('.masthead .emblem').tagName === 'svg');
    check('built-in banners still show',
      doc3.querySelectorAll('[data-slider] .slide').length === 3);
    dom3.window.close();

  } finally {
    fs.copyFileSync(BACKUP, CONTENT);
    fs.unlinkSync(BACKUP);
    server.close();
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : failures + ' CHECK(S) FAILED.'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
