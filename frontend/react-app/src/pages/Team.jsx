import { api, mediaUrl } from '../api.js';
import { useData } from '../components/useData.js';
import Page, { SectionHead, Loading, Empty, OfflineNote } from '../components/Page.jsx';
import { initials } from '../components/formatting.js';

export default function Team() {
  const { data, live, loading } = useData(() => api.team(), []);
  const members = data ?? [];

  // Keep the order the API returned, but group under each category heading.
  const groups = [];
  for (const member of members) {
    const name = member.category || 'Members';
    let group = groups.find((g) => g.name === name);
    if (!group) { group = { name, members: [] }; groups.push(group); }
    group.members.push(member);
  }

  return (
    <Page title="Team" crumbs={[{ label: 'Team' }]}
          description="Office bearers and the executive committee of the club.">
      <section className="section">
        <div className="wrap">
          <SectionHead kicker="Governance" title="Office bearers &amp; committee">
            The executive committee is elected by the general body for a term of three years.
          </SectionHead>

          <OfflineNote live={live} />

          {loading ? <Loading rows={4} /> : members.length === 0 ? (
            <Empty glyph="👥">The committee list has not been published yet.</Empty>
          ) : groups.map((group) => (
            <div key={group.name} style={{ marginBottom: 36 }}>
              <h3 style={{ borderBottom: '2px solid var(--gold)', paddingBottom: 8 }}>
                {group.name}
              </h3>
              <div className="grid cols-4" style={{ marginTop: 20 }}>
                {group.members.map((member) => (
                  <article className="card member" key={member.id}>
                    <div className="body">
                      <div className="photo">
                        {member.photo
                          ? <img src={mediaUrl(member.photo)} alt={member.name} loading="lazy" />
                          : <span className="initials">{initials(member.name)}</span>}
                      </div>
                      <h3 style={{ fontSize: '1rem' }}>{member.name}</h3>
                      <div className="role">{member.position}</div>
                      {member.tenure && <div className="meta">{member.tenure}</div>}
                      {member.bio && <p className="bio">{member.bio}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </Page>
  );
}
