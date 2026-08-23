/**
 * Where the staff panels live.
 *
 * Both panels are served by Django behind the gateway, so on a normal
 * deployment these relative paths are correct and need no editing:
 *
 *     https://your-domain/adminpanel/login/
 *     https://your-domain/superadminpanel/login/
 *
 * If the React site is hosted separately from the backend (for example on a
 * static host), set VITE_BACKEND_URL to the backend's address at build time
 * and the links will point there instead.
 */
const BACKEND = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, '') ?? '';

export const PANEL_LINKS = {
  admin: `${BACKEND}/adminpanel/login/`,
  superAdmin: `${BACKEND}/superadminpanel/login/`,
  analytics: `${BACKEND}/analytics/`,
};

export const IS_SPLIT_HOSTING = BACKEND !== '';
