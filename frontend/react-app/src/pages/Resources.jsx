import { useState } from 'react';
import Page, { SectionHead, Empty } from '../components/Page.jsx';
import { formatDate } from '../components/formatting.js';
import { FALLBACK } from '../data/fallback.js';

/**
 * Public documents. Files are uploaded by an administrator and served by Django
 * under /media/, so the download link is whatever the office attached.
 */
export default function Resources() {
  const [category, setCategory] = useState('all');
  const documents = FALLBACK.resources;
  const categories = ['all', ...new Set(documents.map((d) => d.category))];
  const shown = category === 'all' ? documents : documents.filter((d) => d.category === category);

  return (
    <Page title="Resources" crumbs={[{ label: 'Resources' }]}
          description="Constitution, forms, audited accounts and annual reports of the club.">
      <section className="section">
        <div className="wrap">
          <SectionHead kicker="Public documents" title="Resources &amp; downloads">
            The club publishes its governing documents, forms and audited accounts for public
            inspection. Printed copies are available at the office on request.
          </SectionHead>

          <div className="filters">
            {categories.map((option) => (
              <button key={option} type="button" className="tab"
                      aria-pressed={category === option} onClick={() => setCategory(option)}>
                {option === 'all' ? 'All documents' : option}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <Empty glyph="📁">No documents in this category.</Empty>
          ) : (
            <div className="panel">
              <div className="table-scroll">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th style={{ width: 150 }}>Category</th>
                      <th style={{ width: 150 }}>Updated</th>
                      <th style={{ width: 170 }}>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((document) => (
                      <tr key={document.id}>
                        <td><strong>{document.title}</strong></td>
                        <td><span className="chip">{document.category}</span></td>
                        <td>{formatDate(document.updatedOn)}</td>
                        <td>
                          {document.href ? (
                            <a className="btn btn-sm btn-ghost" href={document.href}>
                              ⬇ {document.size}
                            </a>
                          ) : (
                            <span style={{ color: 'var(--ink-soft)', fontSize: '.86rem' }}>
                              Available at the office
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </Page>
  );
}
