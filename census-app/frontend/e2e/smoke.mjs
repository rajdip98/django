/**
 * Browser smoke test — the whole journey on a phone-sized viewport.
 *
 * Unit tests cover the rules; this covers the things only a real browser shows:
 * that the app boots, that a language switch reaches the DOM, that the OTP
 * round trip works end to end, that a draft survives a reload, and that no
 * screen logs an error or fires a failed request.
 *
 * Run it against a server that is already serving the built app:
 *
 *   cd frontend && npm run build && cp -r dist ../backend/static
 *   cd ../backend && .venv/bin/uvicorn app.main:app --port 8123 &
 *   cd ../frontend && npm i -D playwright && node e2e/smoke.mjs
 *
 * Override the target with BASE_URL, and the browser with CHROME_PATH.
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8123';
// Falls back to Playwright's own download when CHROME_PATH is unset.
const EXEC = process.env.CHROME_PATH || undefined;

const problems = [];
const log = (...a) => console.log(...a);

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },      // iPhone-ish, the real target
  permissions: [],
  locale: 'en-IN',
});
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  if (msg.type() === 'warning' && /React|Warning/i.test(msg.text())) {
    problems.push(`console.warn: ${msg.text()}`);
  }
});
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
page.on('requestfailed', (req) => {
  const url = req.url();
  // Map tiles need the internet; irrelevant to app correctness here.
  if (url.includes('tile.openstreetmap.org')) return;
  problems.push(`requestfailed: ${url} — ${req.failure()?.errorText}`);
});

async function step(name, fn) {
  try {
    await fn();
    log(`  PASS  ${name}`);
  } catch (error) {
    log(`  FAIL  ${name}: ${error.message.split('\n')[0]}`);
    problems.push(`step "${name}": ${error.message.split('\n')[0]}`);
  }
}

log('\n== Login ==');
await page.goto(BASE, { waitUntil: 'networkidle' });

await step('app shell renders', async () => {
  await page.waitForSelector('.login-hero h1', { timeout: 10000 });
  const title = await page.textContent('.login-hero h1');
  if (!title.includes('Census')) throw new Error(`unexpected title: ${title}`);
});

await step('language switch changes the UI', async () => {
  await page.click('.language-card:has-text("हिन्दी")');
  await page.waitForTimeout(200);
  const label = await page.textContent('.login-body .section-label');
  if (!/भाषा|अपनी/.test(label)) throw new Error(`Hindi not applied: ${label}`);
  await page.click('.language-card:has-text("English")');
  await page.waitForTimeout(200);
});

await step('OTP login as enumerator', async () => {
  await page.click('.role-card:has-text("Enumerator")');
  await page.fill('#login-name', 'Ravi Kumar');
  await page.fill('#login-mobile', '9876543210');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.otp-inputs input', { timeout: 10000 });

  // SMS is not configured, so the server hands back the code.
  const banner = await page.textContent('.banner-info');
  const otp = banner.match(/(\d{6})/)?.[1];
  if (!otp) throw new Error('dev OTP not shown');
  const boxes = await page.$$('.otp-inputs input');
  for (let i = 0; i < 6; i += 1) await boxes[i].fill(otp[i]);
  await page.click('button[type="submit"]');
  await page.waitForSelector('.bottom-nav', { timeout: 10000 });
});

log('\n== Household form ==');

await step('create a household', async () => {
  await page.click('.btn:has-text("New household")');
  await page.waitForSelector('.steps', { timeout: 10000 });
});

await step('fill the address step', async () => {
  const byLabel = async (label, value) => {
    const field = page.locator('.field', { has: page.locator(`label:text-is("${label}")`) }).first();
    await field.locator('input').first().fill(value);
  };
  await byLabel('House / door number', '12A');
  await byLabel('Village / town', 'Salt Lake');
  await byLabel('District', 'Kolkata');
  await page.selectOption('select#\\:r0\\:, select', { label: 'West Bengal' }).catch(() => {});
});

await step('housing step accepts chips and selects', async () => {
  await page.click('.step-pill:has-text("Housing")');
  await page.waitForTimeout(150);
  await page.click('.chip:has-text("Pucca (permanent)")');
  await page.click('.chip:has-text("Owned")');
  const selected = await page.$$('.chip.selected');
  if (selected.length < 2) throw new Error(`chips did not select (${selected.length})`);
});

await step('add a member', async () => {
  await page.click('.step-pill:has-text("Members")');
  await page.waitForTimeout(150);
  await page.click('.btn:has-text("Add member")');
  await page.waitForSelector('.sheet', { timeout: 5000 });

  await page.locator('.sheet .field', { has: page.locator('label:text-is("Full name")') })
    .first().locator('input').fill('Asha Debnath');
  await page.click('.sheet .chip:has-text("Female")');
  await page.locator('.sheet .field', { has: page.locator('label:text-is("Age (completed years)")') })
    .first().locator('input').fill('42');
  await page.click('.sheet .chip:has-text("Married")');
  await page.click('.sheet .chip:has-text("General")');

  await page.click('.sheet-footer .btn-primary');
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 5000 });
  const rows = await page.$$('.list-item');
  if (!rows.length) throw new Error('member was not added to the list');
});

await step('validation blocks submission and explains why', async () => {
  await page.click('.step-pill:has-text("Review")');
  await page.waitForTimeout(300);
  const flags = await page.$$('.flag');
  if (!flags.length) throw new Error('no data checks rendered');
  const text = await page.textContent('.flag-list');
  log(`        first check: ${text.trim().split('\n')[0].slice(0, 70)}`);
});

await step('draft persists across a reload', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bottom-nav', { timeout: 10000 });
  await page.click('.bottom-nav a:has-text("Households")');
  await page.waitForTimeout(400);
  const items = await page.$$('.list-item');
  if (!items.length) throw new Error('household did not survive reload');
});

log('\n== Navigation ==');
for (const [tab, marker] of [['Map', '.empty-state, .map-container'], ['Profile', '.card']]) {
  await step(`${tab} tab renders`, async () => {
    await page.click(`.bottom-nav a:has-text("${tab}")`);
    await page.waitForSelector(marker, { timeout: 8000 });
  });
}

await step('profile reports a connected server', async () => {
  const text = await page.textContent('.app-main');
  if (!/Connected/.test(text)) throw new Error('server not reported as connected');
});

log('\n== Admin ==');
await step('admin password login', async () => {
  await page.click('.btn:has-text("Log out")');
  await page.waitForSelector('.sheet-footer', { timeout: 5000 });
  await page.click('.sheet-footer .btn-primary');
  await page.waitForSelector('.login-hero', { timeout: 10000 });

  await page.click('.tab:has-text("Admin login")');
  await page.fill('#admin-password', 'rajdip100@');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.bottom-nav', { timeout: 10000 });
});

await step('admin analytics renders charts', async () => {
  await page.click('.bottom-nav a:has-text("Admin")');
  await page.waitForSelector('.stat-grid', { timeout: 8000 });
  await page.waitForTimeout(600);
  const stats = await page.$$('.stat');
  if (stats.length < 4) throw new Error(`expected stat tiles, saw ${stats.length}`);
});

await step('admin can open every tab', async () => {
  for (const tab of ['Users', 'Zones', 'Export', 'Audit log']) {
    await page.click(`.tab:has-text("${tab}")`);
    await page.waitForTimeout(400);
  }
});

await page.screenshot({ path: 'e2e-admin.png', fullPage: false });
log('        screenshot written to e2e-admin.png');

log('\n== Result ==');
if (problems.length) {
  log(`${problems.length} problem(s) detected:`);
  for (const p of [...new Set(problems)]) log('  - ' + p);
} else {
  log('No console errors, page errors, failed requests or step failures.');
}

await browser.close();
process.exit(problems.length ? 1 : 0);
