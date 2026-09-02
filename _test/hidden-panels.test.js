/* ---------------------------------------------------------------------------
   The panels are reached only by typing their address.

   Two things are checked here, because both were asked for and both are easy
   to undo by accident:

     1. No public page links to, or names, either panel. The pages are the only
        thing a visitor sees, so a stray link is the whole of the exposure.
     2. Changing the Admin password and then the Super Admin password produces
        ONE file carrying both. Building each change from the published file
        instead of from the running draft silently threw the first change away.
   --------------------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SITE = path.join(__dirname, '..', 'frontend', 'website');

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${!condition && detail ? '  <- ' + detail : ''}`);
}

// ---- 1. Nothing on the website points at a panel --------------------------
console.log('\n=== THE PANELS ARE NOT VISIBLE ON THE WEBSITE ===');

const publicPages = fs.readdirSync(SITE)
  .filter(name => /\.html?$/.test(name) && name !== 'check.html');

check('there are public pages to inspect', publicPages.length >= 12, `${publicPages.length} found`);

let anchors = 0;
for (const name of publicPages) {
  const html = fs.readFileSync(path.join(SITE, name), 'utf8');

  const links = html.match(/<a[^>]+href="[^"]*(?:adminpanel|superadminpanel|\/analytics\/)[^"]*"/g) || [];
  check(`${name}: no link to a panel`, links.length === 0, links.join(' '));
  anchors += links.length;

  // The words matter as much as the links: a footer heading that reads
  // "Admin Panel" tells a visitor where to look even with no anchor.
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '')
                      .replace(/<style[\s\S]*?<\/style>/g, '')
                      .replace(/<!--[\s\S]*?-->/g, '')
                      .replace(/<[^>]+>/g, ' ');
  check(`${name}: does not name the panels`,
        !/Admin Panel|Super Admin/i.test(visible),
        (visible.match(/.{0,30}(Admin Panel|Super Admin).{0,20}/i) || [''])[0].trim());
}
check('no panel anchors anywhere on the site', anchors === 0, `${anchors} found`);

// The panels themselves must still be there.
for (const p of ['adminpanel/login/index.html', 'superadminpanel/login/index.html',
                 'adminpanel/index.html', 'superadminpanel/index.html']) {
  check(`${p} still exists`, fs.existsSync(path.join(SITE, p)));
}

// ---- 2. Both passwords survive one editing session ------------------------
console.log('\n=== CHANGING BOTH PASSWORDS KEEPS BOTH ===');

const core = fs.readFileSync(path.join(SITE, 'assets', 'js', 'panel-core.js'), 'utf8');

check('the change builds on a draft, not on the published file',
      /if \(!authDraft\) authDraft = clone\(settings\.accounts\);/.test(core));
check('the draft is what gets written out',
      /authFile\(authDraft, settings\)/.test(core));
check('the draft is declared outside the section, so it survives between changes',
      /var authDraft = null;[\s\S]{0,200}section\('accounts'/.test(core));
check('the panel says which passwords the file carries',
      /It sets the password for/.test(core));

// The shipped file must still be a valid two-account PBKDF2 config.
const authText = fs.readFileSync(path.join(SITE, 'assets', 'js', 'panel-auth.js'), 'utf8');
const sandbox = {};
new Function('window', authText).call(sandbox, sandbox);
const auth = sandbox.CLUB_PANEL_AUTH;

check('the auth file defines two accounts', auth && auth.accounts && auth.accounts.length === 2,
      auth && auth.accounts ? String(auth.accounts.length) : 'missing');
check('one is the admin', !!auth.accounts.find(a => a.role === 'admin'));
check('one is the super admin', !!auth.accounts.find(a => a.role === 'super'));
check('the two accounts use different salts',
      auth.accounts[0].salt !== auth.accounts[1].salt);
check('no plain password is stored anywhere in the file',
      !/password\s*[:=]\s*['"][^'"]+['"]/i.test(authText));
check('the work factor is at least 100,000 iterations', auth.iterations >= 100000,
      String(auth.iterations));

// Each hash must actually be a PBKDF2 result of its own salt — proves the file
// is checkable, and that the two accounts are not sharing one secret.
for (const account of auth.accounts) {
  check(`${account.role}: the hash is 32 bytes of hex`,
        /^[0-9a-f]{64}$/.test(account.hash), account.hash);
}
const shipped = { admin: 'rajdip@10', super: 'rajdip@2007' };
for (const account of auth.accounts) {
  const derived = crypto.pbkdf2Sync(shipped[account.role], account.salt,
                                    auth.iterations, 32, 'sha256').toString('hex');
  check(`${account.role}: the shipped password opens it`, derived === account.hash);
  const wrong = crypto.pbkdf2Sync(shipped[account.role] + 'x', account.salt,
                                  auth.iterations, 32, 'sha256').toString('hex');
  check(`${account.role}: a different password does not`, wrong !== account.hash);
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
