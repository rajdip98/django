import { useState } from 'react';
import { api, mediaUrl } from '../api.js';
import { useData } from '../components/useData.js';
import Page, { SectionHead, Loading, Empty, OfflineNote } from '../components/Page.jsx';
import { formatDate } from '../components/formatting.js';

export default function News() {
  const articles = useData(() => api.articles(36), []);
  const notices = useData(() => api.notices(24), []);
  const [tab, setTab] = useState('news');

  const items = articles.data ?? [];
  const board = notices.data ?? [];

  return (
    <Page title="News & Notices" crumbs={[{ label: 'News & Notices' }]}
          description="Press notes, reports and the official notice board of the club.">
      <section className="section">
        <div className="wrap">
          <SectionHead kicker="Publications" title="News &amp; notices">
            Everything the office publishes appears here. Notices are also displayed on the
            physical board at the club premises.
          </SectionHead>

          <OfflineNote live={articles.live && notices.live} />

          <div className="filters">
            <button type="button" className="tab" aria-pressed={tab === 'news'}
                    onClick={() => setTab('news')}>News &amp; reports</button>
            <button type="button" className="tab" aria-pressed={tab === 'notices'}
                    onClick={() => setTab('notices')}>Notice board</button>
          </div>

          {tab === 'news' ? (
            articles.loading ? <Loading rows={3} /> : items.length === 0 ? (
              <Empty glyph="📰">No articles have been published yet.</Empty>
            ) : (
              <div className="grid cols-3">
                {items.map((article) => (
                  <article className="card" key={article.id}>
                    {article.image && (
                      <div className="thumb">
                        <img src={mediaUrl(article.image)} alt="" loading="lazy" />
                      </div>
                    )}
                    <div className="body">
                      <span className="chip">{article.category || 'News'}</span>
                      <h3>{article.title}</h3>
                      <p className="meta">{formatDate(article.publishedAt)}</p>
                      <p className="excerpt">{article.excerpt}</p>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : (
            notices.loading ? <Loading rows={2} /> : board.length === 0 ? (
              <Empty glyph="📌">The notice board is empty at the moment.</Empty>
            ) : (
              <div className="panel">
                <div className="table-scroll">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th style={{ width: 150 }}>Published</th>
                        <th>Notice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {board.map((notice) => (
                        <tr key={notice.id}>
                          <td>{formatDate(notice.publishedAt)}</td>
                          <td>{notice.title}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      </section>
    </Page>
  );
}
