import { useState } from 'react';
import { api } from '../api.js';
import Page, { SectionHead } from '../components/Page.jsx';

const EMPTY = { name: '', email: '', phone: '', subject: '', message: '' };

/**
 * The contact form posts to the C# service through the gateway. Validation runs
 * here for the visitor's benefit and again on the server, which is the copy
 * that actually decides — a browser check is a courtesy, never a control.
 */
export default function Contact({ site }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ state: 'idle', message: '' });

  function update(field) {
    return (event) => setValues({ ...values, [field]: event.target.value });
  }

  function validate() {
    const found = {};
    if (!values.name.trim()) found.name = 'Please give your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) found.email = 'Please give a valid e-mail address.';
    if (!values.subject.trim()) found.subject = 'Please give a subject.';
    if (values.message.trim().length < 10) found.message = 'Please write at least a sentence.';
    if (values.phone && !/^[\d\s+()-]{6,20}$/.test(values.phone)) {
      found.phone = 'Please give a valid telephone number, or leave this blank.';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    if (!validate()) {
      setStatus({ state: 'idle', message: '' });
      return;
    }
    setStatus({ state: 'sending', message: '' });
    try {
      const result = await api.sendEnquiry(values);
      setValues(EMPTY);
      setStatus({
        state: 'sent',
        message: result?.message || 'Thank you — your enquiry has reached the office.',
      });
    } catch (error) {
      // Say what went wrong and give a way through that does not need the server.
      setStatus({ state: 'error', message: error.message });
    }
  }

  const mailto = `mailto:${site.email}?subject=${encodeURIComponent(values.subject || 'Website enquiry')}`
    + `&body=${encodeURIComponent(values.message)}`;

  return (
    <Page title="Contact" crumbs={[{ label: 'Contact' }]}
          description="Office address, telephone, e-mail and an enquiry form.">
      <section className="section">
        <div className="wrap">
          <div className="layout-sidebar">
            <div className="stack">
              <SectionHead kicker="Get in touch" title="Contact the office">
                Write to us with any question about membership, an event, or the club's work.
                The office replies within three working days.
              </SectionHead>

              {status.state === 'sent' && (
                <div className="notice-strip ok" role="status">{status.message}</div>
              )}
              {status.state === 'error' && (
                <div className="notice-strip error" role="alert">
                  Your message could not be sent: {status.message}. You can{' '}
                  <a href={mailto}>send it by e-mail instead</a>, or call the office on{' '}
                  <a href={`tel:${site.phone}`}>{site.phone}</a>.
                </div>
              )}

              <form className="gov-form" onSubmit={submit} noValidate>
                <div className="field">
                  <label htmlFor="c-name">Your name <span className="req">*</span></label>
                  <input id="c-name" value={values.name} onChange={update('name')}
                         aria-invalid={Boolean(errors.name)} autoComplete="name" required />
                  {errors.name && <div className="field-error">{errors.name}</div>}
                </div>

                <div className="grid cols-2" style={{ gap: 16 }}>
                  <div className="field">
                    <label htmlFor="c-email">E-mail <span className="req">*</span></label>
                    <input id="c-email" type="email" value={values.email} onChange={update('email')}
                           aria-invalid={Boolean(errors.email)} autoComplete="email" required />
                    {errors.email && <div className="field-error">{errors.email}</div>}
                  </div>
                  <div className="field">
                    <label htmlFor="c-phone">Telephone</label>
                    <input id="c-phone" type="tel" value={values.phone} onChange={update('phone')}
                           aria-invalid={Boolean(errors.phone)} autoComplete="tel" />
                    {errors.phone
                      ? <div className="field-error">{errors.phone}</div>
                      : <div className="hint">Optional.</div>}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="c-subject">Subject <span className="req">*</span></label>
                  <input id="c-subject" value={values.subject} onChange={update('subject')}
                         aria-invalid={Boolean(errors.subject)} required />
                  {errors.subject && <div className="field-error">{errors.subject}</div>}
                </div>

                <div className="field">
                  <label htmlFor="c-message">Message <span className="req">*</span></label>
                  <textarea id="c-message" rows={7} value={values.message} onChange={update('message')}
                            aria-invalid={Boolean(errors.message)} required />
                  {errors.message && <div className="field-error">{errors.message}</div>}
                </div>

                <div>
                  <button className="btn btn-gold" type="submit" disabled={status.state === 'sending'}>
                    {status.state === 'sending' ? 'Sending…' : 'Send enquiry'}
                  </button>
                </div>
              </form>
            </div>

            <aside className="stack">
              <div className="panel">
                <div className="panel-head">Club office</div>
                <div className="panel-body">
                  <dl className="kv">
                    <dt>Address</dt><dd className="multiline">{site.addressLine}</dd>
                    <dt>Telephone</dt><dd><a href={`tel:${site.phone}`}>{site.phone}</a></dd>
                    <dt>E-mail</dt><dd><a href={`mailto:${site.email}`}>{site.email}</a></dd>
                    <dt>Open</dt><dd>{site.officeHours}</dd>
                  </dl>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">Where we are</div>
                <div className="panel-body" style={{ fontSize: '.92rem' }}>
                  <p>
                    The club hall is on Rabindra Sarani, opposite the ward health centre, a
                    ten-minute walk from the municipal bus stand.
                  </p>
                  <p style={{ margin: 0 }}>
                    <a className="btn btn-ghost btn-sm"
                       href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(site.addressLine)}`}
                       target="_blank" rel="noreferrer noopener">
                      Open in maps ↗
                    </a>
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </Page>
  );
}
