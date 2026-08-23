import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSite } from './SiteContext.js';

/**
 * Every inner page shares this shell: it sets the document title for the tab
 * and for search engines, prints the breadcrumb trail, and moves focus to the
 * heading so a screen reader announces the new page after navigation.
 */
export default function Page({ title, description, crumbs = [], children }) {
  const site = useSite();

  useEffect(() => {
    document.title = `${title} — ${site.organizationName}`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && description) meta.setAttribute('content', description);
  }, [title, description, site.organizationName]);

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <div className="wrap">
          <ol>
            <li><Link to="/">Home</Link></li>
            {crumbs.map((crumb) => (
              <li key={crumb.label}>
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
              </li>
            ))}
          </ol>
        </div>
      </nav>
      {children}
    </>
  );
}

export function SectionHead({ kicker, title, children }) {
  return (
    <div className="section-head">
      {kicker && <span className="kicker">{kicker}</span>}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Empty({ glyph = '📄', children }) {
  return (
    <div className="empty-state">
      <span className="glyph" aria-hidden="true">{glyph}</span>
      <p>{children}</p>
    </div>
  );
}

export function Loading({ rows = 3 }) {
  return (
    <div className="grid cols-3" aria-busy="true" aria-live="polite">
      <span className="skip-link">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card">
          <div className="skeleton" style={{ aspectRatio: '16 / 9' }} />
          <div className="body">
            <div className="skeleton" style={{ height: 18, width: '75%' }} />
            <div className="skeleton" style={{ height: 12, width: '45%' }} />
            <div className="skeleton" style={{ height: 12, width: '90%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Shown when the API could not be reached and seed content is standing in. */
export function OfflineNote({ live }) {
  if (live) return null;
  return (
    <div className="notice-strip warn" style={{ marginBottom: 20 }}>
      Showing the published sample content — the content service is not reachable from this
      browser right now. Nothing has been lost; the page will fill in once it responds.
    </div>
  );
}
