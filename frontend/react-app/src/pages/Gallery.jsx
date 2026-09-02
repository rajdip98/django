import { useEffect, useState } from 'react';
import { api, mediaUrl } from '../api.js';
import { useData } from '../components/useData.js';
import Page, { SectionHead, Loading, Empty, OfflineNote } from '../components/Page.jsx';
import { formatDate } from '../components/formatting.js';

export default function Gallery() {
  const { data, live, loading } = useData(() => api.gallery(48), []);
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState(null);

  const items = data ?? [];
  const categories = ['all', ...new Set(items.map((item) => item.category).filter(Boolean))];
  const shown = category === 'all' ? items : items.filter((item) => item.category === category);

  // Escape closes the lightbox, as a viewer expects.
  useEffect(() => {
    if (open === null) return undefined;
    function onKey(event) { if (event.key === 'Escape') setOpen(null); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const current = open === null ? null : shown[open];

  return (
    <Page title="Gallery" crumbs={[{ label: 'Gallery' }]}
          description="Photographs from club programmes and events.">
      <section className="section">
        <div className="wrap">
          <SectionHead kicker="Photographs" title="Gallery" />
          <OfflineNote live={live} />

          {categories.length > 2 && (
            <div className="filters">
              {categories.map((option) => (
                <button key={option} type="button" className="tab"
                        aria-pressed={category === option}
                        onClick={() => { setCategory(option); setOpen(null); }}>
                  {option === 'all' ? 'All photographs' : option}
                </button>
              ))}
            </div>
          )}

          {loading ? <Loading rows={4} /> : shown.length === 0 ? (
            <Empty glyph="🖼">No photographs have been published in this category yet.</Empty>
          ) : (
            <div className="gallery-grid">
              {shown.map((item, index) => (
                <figure className="gallery-item" key={item.id} style={{ margin: 0 }}>
                  <button type="button" onClick={() => setOpen(index)}
                          style={{ all: 'unset', cursor: 'zoom-in', display: 'block', height: '100%' }}
                          aria-label={`View: ${item.title}`}>
                    {item.image ? (
                      <img src={mediaUrl(item.image)} alt={item.title} loading="lazy" />
                    ) : (
                      <span style={{ display: 'grid', placeItems: 'center', height: '100%',
                                     fontSize: '2rem', color: 'var(--ink-soft)' }}>
                        🖼
                      </span>
                    )}
                  </button>
                  <figcaption>{item.title}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </section>

      {current && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={current.title}
             onClick={() => setOpen(null)}>
          <button className="close" type="button" aria-label="Close" onClick={() => setOpen(null)}>×</button>
          <div onClick={(event) => event.stopPropagation()}>
            {current.image ? (
              <img src={mediaUrl(current.image)} alt={current.title} />
            ) : current.videoUrl && /^https?:\/\//i.test(current.videoUrl) ? (
              /* Only http(s) links are followed — a caption cannot smuggle in a
                 javascript: URL. */
              <a className="btn btn-gold" href={current.videoUrl}
                 target="_blank" rel="noreferrer noopener">Watch the video ↗</a>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', width: '60vw', height: '50vh',
                            background: '#101c2e', color: '#7f95b5', fontSize: '3rem' }}>
                🖼
              </div>
            )}
            {/* Text nodes only — captions are administrator input and are never
                inserted as markup. */}
            <p className="caption">
              <strong>{current.title}</strong><br />
              {current.caption}
              {current.takenOn && <> · {formatDate(current.takenOn)}</>}
            </p>
          </div>
        </div>
      )}
    </Page>
  );
}
