import { useEffect, useState } from 'react';
import { PANEL_LINKS } from '../config.js';

/**
 * The narrow strip above the masthead: appearance controls a visitor can set
 * for themselves, and the two staff entrances.
 *
 * The panel links are ordinary links, deliberately visible. They lead to
 * Django's login pages — being able to see the door is not the same as being
 * able to open it.
 */
export default function TopStrip() {
  const [theme, setTheme] = useState('light');
  const [contrast, setContrast] = useState('normal');
  const [font, setFont] = useState('md');

  useEffect(() => {
    const root = document.documentElement;
    setTheme(root.getAttribute('data-theme') || 'light');
    setContrast(root.getAttribute('data-contrast') || 'normal');
    setFont(root.getAttribute('data-font') || 'md');
  }, []);

  function apply(attribute, value, setter, storageKey) {
    document.documentElement.setAttribute(attribute, value);
    setter(value);
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      // Private browsing: the choice still applies for this visit.
    }
  }

  const fonts = { md: 'lg', lg: 'xl', xl: 'md' };

  return (
    <div className="top-strip">
      <div className="wrap">
        <span>Government of West Bengal · Registered Society</span>
        <span className="spacer" />

        <button type="button" onClick={() => apply('data-font', fonts[font], setFont, 'club-font')}
                title="Change the text size">
          A<sup>+</sup> Text size
        </button>
        <button type="button" aria-pressed={contrast === 'high'}
                onClick={() => apply('data-contrast', contrast === 'high' ? 'normal' : 'high',
                                     setContrast, 'club-contrast')}>
          ◐ High contrast
        </button>
        <button type="button" aria-pressed={theme === 'dark'}
                onClick={() => apply('data-theme', theme === 'dark' ? 'light' : 'dark',
                                     setTheme, 'club-theme')}>
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>

        <a className="staff-link" href={PANEL_LINKS.admin}>🔑 Admin Panel</a>
        <a className="staff-link super" href={PANEL_LINKS.superAdmin}>⬢ Super Admin</a>
      </div>
    </div>
  );
}
