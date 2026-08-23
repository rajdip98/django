import { Link } from 'react-router-dom';
import { PANEL_LINKS } from '../config.js';

export default function Footer({ site }) {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <h3>{site.shortName}</h3>
            <p style={{ fontSize: '.9rem' }}>{site.organizationName}</p>
            <p style={{ fontSize: '.85rem' }}>
              {site.registrationNo}<br />
              Established {site.establishedYear}
            </p>
          </div>

          <div>
            <h3>Quick links</h3>
            <ul>
              <li><Link to="/about">About the club</Link></li>
              <li><Link to="/events">Events calendar</Link></li>
              <li><Link to="/membership">Become a member</Link></li>
              <li><Link to="/resources">Documents &amp; downloads</Link></li>
              <li><Link to="/news">News &amp; notices</Link></li>
            </ul>
          </div>

          <div>
            <h3>Office</h3>
            <ul>
              <li className="footer-address">{site.addressLine}</li>
              <li><a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a></li>
              <li><a href={`mailto:${site.email}`}>{site.email}</a></li>
              <li style={{ fontSize: '.85rem' }}>{site.officeHours}</li>
            </ul>
          </div>

          <div>
            <h3>Staff</h3>
            <ul>
              <li><a href={PANEL_LINKS.admin}>🔑 Admin Panel</a></li>
              <li><a href={PANEL_LINKS.superAdmin}>⬢ Super Admin Panel</a></li>
              <li><a href={PANEL_LINKS.analytics}>📊 Analytics dashboard</a></li>
            </ul>
            <p style={{ fontSize: '.8rem', marginTop: 12, opacity: .8 }}>
              Staff sign-in only. Every attempt is recorded in the audit log.
            </p>
          </div>
        </div>

        <div className="footer-bar">
          <span>© {year} {site.organizationName}. All rights reserved.</span>
          <span className="spacer" />
          <Link to="/contact">Contact</Link>
          <a href={PANEL_LINKS.admin}>Admin Panel</a>
          <a href={PANEL_LINKS.superAdmin}>Super Admin</a>
        </div>
      </div>
    </footer>
  );
}
