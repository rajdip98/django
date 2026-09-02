import { Link, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../api.js';
import { useData } from '../components/useData.js';
import Page, { Loading, Empty } from '../components/Page.jsx';
import { formatDateTime, isUpcoming } from '../components/formatting.js';
import { PANEL_LINKS } from '../config.js';

export default function EventDetail() {
  const { slug } = useParams();
  const { data, loading } = useData(() => api.events('all', 96), []);

  if (loading) {
    return (
      <Page title="Event" crumbs={[{ label: 'Events', to: '/events' }, { label: 'Loading…' }]}>
        <section className="section"><div className="wrap"><Loading rows={1} /></div></section>
      </Page>
    );
  }

  const event = (data ?? []).find((item) => item.slug === slug);

  if (!event) {
    return (
      <Page title="Event not found" crumbs={[{ label: 'Events', to: '/events' }, { label: 'Not found' }]}>
        <section className="section">
          <div className="wrap">
            <Empty glyph="🔎">
              This event is no longer listed. It may have been removed by the office.{' '}
              <Link to="/events">Return to the calendar</Link>.
            </Empty>
          </div>
        </section>
      </Page>
    );
  }

  const open = event.registrationOpen && isUpcoming(event.start);

  return (
    <Page title={event.title} description={event.summary}
          crumbs={[{ label: 'Events', to: '/events' }, { label: event.title }]}>
      <section className="section">
        <div className="wrap">
          <div className="layout-sidebar">
            <article className="stack">
              <span className="chip gold">{event.category || 'Programme'}</span>
              <h1>{event.title}</h1>
              {event.image && (
                <img src={mediaUrl(event.image)} alt=""
                     style={{ borderRadius: 'var(--radius-lg)', width: '100%' }} />
              )}
              <p style={{ fontSize: '1.05rem' }}>{event.summary}</p>
              <p>
                Members and residents are welcome. Please carry a photo identity card. For any
                question about this programme, write to the office through the{' '}
                <Link to="/contact">contact page</Link> or call during working hours.
              </p>
            </article>

            <aside className="stack">
              <div className="panel">
                <div className="panel-head">Event details</div>
                <div className="panel-body">
                  <dl className="kv">
                    <dt>Starts</dt><dd>{formatDateTime(event.start)}</dd>
                    <dt>Ends</dt><dd>{formatDateTime(event.end)}</dd>
                    <dt>Venue</dt><dd>{event.venue}</dd>
                    <dt>Category</dt><dd>{event.category || '—'}</dd>
                    <dt>Registration</dt>
                    <dd>
                      {open
                        ? <span className="chip green">Open</span>
                        : <span className="chip maroon">Closed</span>}
                    </dd>
                  </dl>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">Register</div>
                <div className="panel-body">
                  {open ? (
                    <>
                      <p style={{ fontSize: '.92rem' }}>
                        Registration is handled by the club office system. Sign in to your
                        member account to register for this event.
                      </p>
                      <a className="btn btn-gold" href={`${PANEL_LINKS.admin.replace('/adminpanel/login/', '')}/login/?next=/events/${event.slug}/`}>
                        Sign in and register
                      </a>
                    </>
                  ) : (
                    <p style={{ fontSize: '.92rem', margin: 0 }}>
                      Registration for this programme is closed. Please see the{' '}
                      <Link to="/events">calendar</Link> for what is coming next.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </Page>
  );
}
