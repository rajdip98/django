import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import Emblem from './Emblem.jsx';
import TopStrip from './TopStrip.jsx';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/events', label: 'Events' },
  { to: '/activities', label: 'Activities' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/team', label: 'Team' },
  { to: '/news', label: 'News & Notices' },
  { to: '/membership', label: 'Membership' },
  { to: '/resources', label: 'Resources' },
  { to: '/contact', label: 'Contact' },
];

export default function Header({ site, notices }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const navigate = useNavigate();

  function search(event) {
    event.preventDefault();
    const query = term.trim();
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <header>
      <TopStrip />

      <div className="masthead">
        <div className="wrap">
          <Emblem />
          <div className="titles">
            <h1>{site.organizationName}</h1>
            <p>{site.slogan} · Established {site.establishedYear}</p>
          </div>
          <form role="search" onSubmit={search}>
            <label className="skip-link" htmlFor="site-search">Search this website</label>
            <input id="site-search" type="search" placeholder="Search events, notices, pages…"
                   value={term} onChange={(e) => setTerm(e.target.value)} />
            <button className="search-btn" type="submit">Search</button>
          </form>
        </div>
      </div>

      <button className="nav-toggle" type="button" aria-expanded={open}
              aria-controls="primary-navigation" onClick={() => setOpen(!open)}>
        ☰ Menu
      </button>

      <nav id="primary-navigation" className={`mainnav${open ? ' open' : ''}`}
           aria-label="Primary">
        <div className="wrap">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
                     className={({ isActive }) => (isActive ? 'active' : undefined)}
                     onClick={() => setOpen(false)}>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {notices.length > 0 && (
        <div className="ticker">
          <div className="wrap">
            <span className="label">Notices</span>
            <ul>
              {notices.slice(0, 3).map((notice) => (
                <li key={notice.id}>{notice.title}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}
