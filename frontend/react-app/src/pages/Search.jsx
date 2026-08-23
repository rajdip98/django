import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Page, { SectionHead, Empty, Loading } from '../components/Page.jsx';
import { formatDate } from '../components/formatting.js';

const STATIC_PAGES = [
  { title: 'About the club', to: '/about', text: 'history objectives values governance committee constitution' },
  { title: 'Membership', to: '/membership', text: 'join apply subscription fee renewal member benefits form' },
  { title: 'Resources & downloads', to: '/resources', text: 'documents constitution accounts annual report forms' },
  { title: 'Contact the office', to: '/contact', text: 'address telephone email enquiry office hours' },
  { title: 'Activities', to: '/activities', text: 'social service sports culture education health environment' },
];

/** Searches every collection the API exposes, plus the site's own pages. */
export default function Search() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [term, setTerm] = useState(query);
  const [sources, setSources] = useState(null);

  useEffect(() => { setTerm(query); }, [query]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.events('all', 96), api.articles(48), api.notices(48),
      api.activities(), api.team(), api.gallery(48),
    ]).then(([events, articles, notices, activities, team, gallery]) => {
      if (cancelled) return;
      setSources({
        events: events.data ?? [], articles: articles.data ?? [], notices: notices.data ?? [],
        activities: activities.data ?? [], team: team.data ?? [], gallery: gallery.data ?? [],
      });
    });
    return () => { cancelled = true; };
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !sources) return [];

    const found = [];
    const push = (kind, title, to, meta, text) => {
      if (`${title} ${text ?? ''}`.toLowerCase().includes(needle)) {
        found.push({ kind, title, to, meta });
      }
    };

    for (const e of sources.events) {
      push('Event', e.title, `/events/${e.slug}`, formatDate(e.start), `${e.summary} ${e.venue} ${e.category}`);
    }
    for (const a of sources.articles) push('News', a.title, '/news', formatDate(a.publishedAt), a.excerpt);
    for (const n of sources.notices) push('Notice', n.title, '/news', formatDate(n.publishedAt), '');
    for (const a of sources.activities) push('Activity', a.title, '/activities', 'Club wing', a.description);
    for (const m of sources.team) push('Team', m.name, '/team', m.position, `${m.bio} ${m.category}`);
    for (const g of sources.gallery) push('Photograph', g.title, '/gallery', formatDate(g.takenOn), g.caption);
    for (const p of STATIC_PAGES) push('Page', p.title, p.to, 'Website page', p.text);

    return found;
  }, [query, sources]);

  function submit(event) {
    event.preventDefault();
    setParams(term.trim() ? { q: term.trim() } : {});
  }

  return (
    <Page title={query ? `Search: ${query}` : 'Search'} crumbs={[{ label: 'Search' }]}
          description="Search events, notices, news, photographs and pages of this website.">
      <section className="section">
        <div className="wrap">
          <SectionHead kicker="Find" title="Search this website" />

          <form className="gov-form" onSubmit={submit} style={{ maxWidth: 620, marginBottom: 28 }}>
            <div className="field">
              <label htmlFor="q">Search term</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="q" type="search" value={term} onChange={(e) => setTerm(e.target.value)}
                       placeholder="For example: blood donation, membership, football" />
                <button className="btn" type="submit">Search</button>
              </div>
            </div>
          </form>

          {!query ? (
            <Empty glyph="🔎">Enter a word above to search the whole website.</Empty>
          ) : !sources ? (
            <Loading rows={2} />
          ) : results.length === 0 ? (
            <Empty glyph="🔎">
              Nothing matched “{query}”. Try a shorter word, or browse the{' '}
              <Link to="/events">events calendar</Link>.
            </Empty>
          ) : (
            <>
              <p style={{ color: 'var(--ink-soft)' }}>
                {results.length} result{results.length === 1 ? '' : 's'} for “{query}”.
              </p>
              <div className="panel">
                <ul className="panel-list">
                  {results.map((result, index) => (
                    <li key={`${result.kind}-${result.title}-${index}`}>
                      <Link to={result.to}>
                        <span className="chip" style={{ marginRight: 8 }}>{result.kind}</span>
                        {result.title}
                        <span className="meta">{result.meta}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </section>
    </Page>
  );
}
