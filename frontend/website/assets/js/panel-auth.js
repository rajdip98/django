/* ---------------------------------------------------------------------------
   panel-auth.js — who may sign in to the panels.

   The passwords themselves are not in this file and cannot be read out of it.
   What is stored is a PBKDF2-SHA256 hash: a one-way result that can confirm a
   password typed at the sign-in box but cannot be turned back into it.

   The Super Admin Panel writes this file. Change a password there, download the
   new file, and upload it over this one at assets/js/panel-auth.js.

   Signing in here unlocks the editing screen in your browser. It is a lock on
   the panel, not on the web host: the real protection for your website is your
   hosting password, because publishing means uploading a file. To put a lock in
   front of these pages on the server as well, see "Locking the panel on the
   server" in the Super Admin Panel — cPanel does it in about a minute.
   --------------------------------------------------------------------------- */

window.CLUB_PANEL_AUTH = {
  version: 2,
  iterations: 100000,

  accounts: [
    {
      id: 'admin',
      role: 'admin',
      name: 'Administrator',
      salt: 'kycc.admin.v2',
      hash: '00f395733c6d217df9b02d153f64796d83318c99878fa1e8a4e9d7808a612c71'
    },
    {
      id: 'super',
      role: 'super',
      name: 'Super Administrator',
      salt: 'kycc.super.v2',
      hash: 'fe1bb6668af419a77da06f9e38f9867b6afd51cfb65d857e6f042f4ede52a813'
    }
  ],

  // How long a signed-in panel stays open with nobody using it, in minutes.
  idleMinutes: 30,

  // Wrong passwords in a row before the box pauses, and for how many seconds.
  lockAfterAttempts: 5,
  lockSeconds: 60
};
