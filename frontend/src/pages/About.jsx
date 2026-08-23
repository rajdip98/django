import Page, { SectionHead } from '../components/Page.jsx';
import { FALLBACK } from '../data/fallback.js';

export default function About({ site }) {
  return (
    <Page title="About the club" crumbs={[{ label: 'About' }]}
          description="History, objectives, values and governance of the club.">
      <section className="section">
        <div className="wrap">
          <div className="layout-sidebar">
            <div className="stack">
              <SectionHead kicker="Who we are" title="About the club" />
              <p>
                {site.organizationName} was founded in {site.establishedYear} by residents of the
                ward who wanted a permanent body to organise relief work, sport and cultural
                activity. It is registered under the West Bengal Societies Registration Act
                ({site.registrationNo}) and is governed by a constitution adopted by its general body.
              </p>
              <p>
                The club is run by an executive committee elected for a three-year term. Its
                accounts are audited annually and published on this website, along with the
                annual report. Any member may inspect the registers at the office during
                working hours.
              </p>

              <h3>Objectives</h3>
              <ul>
                <li>To organise relief and welfare work for residents of the ward.</li>
                <li>To promote sport and physical education among young people.</li>
                <li>To preserve and encourage local cultural traditions.</li>
                <li>To support the education of students in need.</li>
                <li>To work with the municipality and district administration on public health.</li>
              </ul>

              <h3>Milestones</h3>
              <div className="table-scroll">
                <table className="gov-table">
                  <thead>
                    <tr><th style={{ width: 110 }}>Year</th><th>Milestone</th></tr>
                  </thead>
                  <tbody>
                    {FALLBACK.milestones.map((milestone) => (
                      <tr key={milestone.id}>
                        <td><strong>{milestone.year}</strong></td>
                        <td>
                          <strong>{milestone.title}</strong><br />
                          <span style={{ color: 'var(--ink-soft)', fontSize: '.9rem' }}>
                            {milestone.description}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="stack">
              <div className="panel">
                <div className="panel-head">At a glance</div>
                <div className="panel-body">
                  <dl className="kv">
                    <dt>Established</dt><dd>{site.establishedYear}</dd>
                    <dt>Registration</dt><dd>{site.registrationNo}</dd>
                    <dt>Members</dt><dd>1,240 and growing</dd>
                    <dt>Committee</dt><dd>Elected, three-year term</dd>
                    <dt>Accounts</dt><dd>Audited and published yearly</dd>
                  </dl>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">Our values</div>
                <ul className="panel-list">
                  {FALLBACK.values.map((value) => (
                    <li key={value.id}>
                      <span style={{ display: 'block', padding: '12px 18px' }}>
                        <strong>{value.title}</strong>
                        <span className="meta">{value.description}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </Page>
  );
}
