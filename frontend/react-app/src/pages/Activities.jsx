import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useData } from '../components/useData.js';
import Page, { SectionHead, Loading, Empty, OfflineNote } from '../components/Page.jsx';

export default function Activities() {
  const { data, live, loading } = useData(() => api.activities(), []);
  const activities = data ?? [];

  return (
    <Page title="Activities" crumbs={[{ label: 'Activities' }]}
          description="The standing wings of the club and the work each one does.">
      <section className="section">
        <div className="wrap">
          <SectionHead kicker="Our wings" title="What the club does">
            Each wing is led by an elected secretary and reports to the general body at the
            annual meeting.
          </SectionHead>

          <OfflineNote live={live} />

          {loading ? <Loading rows={3} /> : activities.length === 0 ? (
            <Empty glyph="🗂">No activities have been published yet.</Empty>
          ) : (
            <div className="grid cols-2">
              {activities.map((activity) => (
                <article className="card" key={activity.id}>
                  <div className="body">
                    <h3>
                      <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>
                        {activity.icon || '▪'}
                      </span>{' '}
                      {activity.title}
                    </h3>
                    {activity.frequency && <span className="chip green">{activity.frequency}</span>}
                    <p className="excerpt">{activity.summary ?? activity.description}</p>
                    <div className="foot">
                      <Link className="btn btn-ghost btn-sm" to="/events">
                        See programmes
                      </Link>
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
