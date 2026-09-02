import { Link } from 'react-router-dom';
import { api, mediaUrl } from '../api.js';
import { useData } from '../components/useData.js';
import { SectionHead, Loading, Empty } from '../components/Page.jsx';
import { formatDateTime, formatDate } from '../components/formatting.js';
import { FALLBACK } from '../data/fallback.js';

export default function Home({ site }) {
  const events = useData(() => api.events('upcoming', 3), []);
  const news = useData(() => api.articles(3), []);
  const stats = useData(() => api.statistics(), []);
  const activities = useData(() => api.activities(), []);
  const notices = useData(() => api.notices(5), []);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <span className="eyebrow">Established {site.establishedYear} · Registered society</span>
          <h2>{site.organizationName}</h2>
          <p>
            A registered community organisation working across the ward in social service,
            sport, culture, education and public health. Membership is open to every
            resident, and our accounts are published each year.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-gold" to="/membership">Become a member</Link>
            <Link className="btn btn-outline on-dark" to="/events">Upcoming events</Link>
            <Link className="btn btn-outline on-dark" to="/resources">Public documents</Link>
          </div>
        </div>
      </section>

      <section className="stat-band">
        <div className="wrap">
          <div className="grid cols-4">
            {(stats.data ?? FALLBACK.statistics).map((stat) => (
              <div className="stat" key={stat.id}>
                <div className="n">{stat.value.toLocaleString('en-IN')}{stat.suffix}</div>
                <div className="l">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <SectionHead kicker="What we do" title="Our activities">
            Six standing wings run the club's programmes through the year, each led by an
            elected secretary answerable to the general body.
          </SectionHead>

          {activities.loading ? <Loading rows={3} /> : (
            <div className="grid cols-3">
              {(activities.data ?? []).map((activity) => (
                <article className="card" key={activity.id}>
                  <div className="body">
                    <h3><span aria-hidden="true">{activity.icon || '▪'}</span> {activity.title}</h3>
                    <p className="excerpt">{activity.summary ?? activity.description}</p>
                    <div className="foot">
                      <Link className="btn btn-ghost btn-sm" to="/activities">Read more</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section alt">
        <div className="wrap">
          <div className="layout-sidebar">
            <div>
              <SectionHead kicker="Calendar" title="Upcoming events" />
              {events.loading ? <Loading rows={2} /> : (
                (events.data ?? []).length === 0
                  ? <Empty glyph="🗓">No events are scheduled at the moment. Please check back soon.</Empty>
                  : (
                    <div className="grid cols-2">
                      {events.data.map((event) => (
                        <article className="card" key={event.id}>
                          {event.image && (
                            <div className="thumb">
                              <img src={mediaUrl(event.image)} alt="" loading="lazy" />
                            </div>
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
                              <Link className="btn btn-sm" to={`/events/${event.slug}`}>
                                Details &amp; registration
                              </Link>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )
              )}
              <p style={{ marginTop: 20 }}>
                <Link className="btn btn-outline" to="/events">View the full calendar</Link>
              </p>
            </div>

            <aside className="stack">
              <div className="panel">
                <div className="panel-head">
                  Notice board <Link to="/news">All notices</Link>
                </div>
                <ul className="panel-list">
                  {(notices.data ?? []).map((notice) => (
                    <li key={notice.id}>
                      <Link to="/news">
                        {notice.title}
                        <span className="meta">{formatDate(notice.publishedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="panel">
                <div className="panel-head">Office</div>
                <div className="panel-body">
                  <dl className="kv">
                    <dt>Address</dt><dd className="multiline">{site.addressLine}</dd>
                    <dt>Phone</dt><dd><a href={`tel:${site.phone}`}>{site.phone}</a></dd>
                    <dt>E-mail</dt><dd><a href={`mailto:${site.email}`}>{site.email}</a></dd>
                    <dt>Open</dt><dd>{site.officeHours}</dd>
                  </dl>
                  <p style={{ marginTop: 16, marginBottom: 0 }}>
                    <Link className="btn btn-ghost btn-sm" to="/contact">Write to the office</Link>
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <SectionHead kicker="Latest" title="News from the club" />
          {news.loading ? <Loading rows={3} /> : (
            <div className="grid cols-3">
              {(news.data ?? []).map((article) => (
                <article className="card" key={article.id}>
                  {article.image && (
                    <div className="thumb"><img src={mediaUrl(article.image)} alt="" loading="lazy" /></div>
                  )}
                  <div className="body">
                    <span className="chip">{article.category || 'News'}</span>
                    <h3><Link to="/news">{article.title}</Link></h3>
                    <p className="meta">{formatDate(article.publishedAt)}</p>
                    <p className="excerpt">{article.excerpt}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
