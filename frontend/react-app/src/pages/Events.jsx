import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mediaUrl } from '../api.js';
import { useData } from '../components/useData.js';
import Page, { SectionHead, Loading, Empty, OfflineNote } from '../components/Page.jsx';
import { formatDateTime } from '../components/formatting.js';

const SCOPES = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All events' },
];

export default function Events() {
  const [scope, setScope] = useState('upcoming');
  const [category, setCategory] = useState('all');
  const { data, live, loading } = useData(() => api.events(scope, 48), [scope]);

  const events = data ?? [];
  const categories = ['all', ...new Set(events.map((e) => e.category).filter(Boolean))];
  const shown = category === 'all' ? events : events.filter((e) => e.category === category);

  return (
    <Page title="Events" crumbs={[{ label: 'Events' }]}
          description="Calendar of club programmes, camps and tournaments.">
      <section className="section">
        <div className="wrap">
          <SectionHead kicker="Calendar" title="Events and programmes">
            Every programme announced by the office appears here. Registration, where it is
            open, closes at the time stated on the event page.
          </SectionHead>

          <OfflineNote live={live} />

          <div className="filters">
            {SCOPES.map((option) => (
              <button key={option.key} type="button" className="tab"
                      aria-pressed={scope === option.key}
                      onClick={() => { setScope(option.key); setCategory('all'); }}>
                {option.label}
              </button>
            ))}
            {categories.length > 2 && (
              <>
                <span style={{ width: 1, height: 24, background: 'var(--line)' }} />
                {categories.map((option) => (
                  <button key={option} type="button" className="tab"
                          aria-pressed={category === option}
                          onClick={() => setCategory(option)}>
                    {option === 'all' ? 'All categories' : option}
                  </button>
                ))}
              </>
            )}
          </div>

          {loading ? <Loading rows={3} /> : shown.length === 0 ? (
            <Empty glyph="🗓">
              No events match this filter. Try another category, or view the full calendar.
            </Empty>
          ) : (
            <div className="grid cols-3">
              {shown.map((event) => (
                <article className="card" key={event.id}>
                  {event.image && (
                    <div className="thumb"><img src={mediaUrl(event.image)} alt="" loading="lazy" /></div>
                  )}
                  <div className="body">
                    <span className="chip gold">{event.category || 'Programme'}</span>
                    <h3><Link to={`/events/${event.slug}`}>{event.title}</Link></h3>
                    <p className="meta">
                      {formatDateTime(event.start)}<br />
                      <span aria-hidden="true">📍</span> {event.venue}
                    </p>
                    <p className="excerpt">{event.summary}</p>
                    <div className="foot">
                      <Link className="btn btn-sm" to={`/events/${event.slug}`}>View details</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </Page>
  );
}
