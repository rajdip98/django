import { Link } from 'react-router-dom';
import Page from '../components/Page.jsx';

export default function NotFound() {
  return (
    <Page title="Page not found" crumbs={[{ label: 'Not found' }]}>
      <section className="section">
        <div className="wrap" style={{ textAlign: 'center', maxWidth: 640 }}>
          <p style={{ fontSize: '3.5rem', margin: 0 }} aria-hidden="true">🧭</p>
          <h1>That page could not be found</h1>
          <p>
            The address may have changed, or the page may have been removed by the office.
            Everything the club publishes can be reached from the main menu.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-gold" to="/">Go to the home page</Link>
            <Link className="btn btn-outline" to="/events">Events calendar</Link>
            <Link className="btn btn-ghost" to="/contact">Contact the office</Link>
          </div>
        </div>
      </section>
    </Page>
  );
}
