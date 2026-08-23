import { Link } from 'react-router-dom';
import Page, { SectionHead } from '../components/Page.jsx';
import { FALLBACK } from '../data/fallback.js';
import { PANEL_LINKS } from '../config.js';

const BENEFITS = [
  'A vote in the general body and in committee elections.',
  'Free or reduced entry to every club programme.',
  'Use of the reading room, library and indoor games facilities.',
  'Participation certificates for club events.',
  'Notice of every meeting, sent by e-mail and post.',
];

const STEPS = [
  { n: 1, title: 'Fill in the form',
    text: 'Complete the membership form online, or collect a printed copy from the office.' },
  { n: 2, title: 'Submit proof of residence',
    text: 'Any government-issued identity card showing an address in the ward.' },
  { n: 3, title: 'Pay the subscription',
    text: 'The annual subscription is ₹300, payable at the office or by bank transfer.' },
  { n: 4, title: 'Verification',
    text: 'The office verifies the application, usually within seven working days.' },
];

export default function Membership() {
  const site = FALLBACK.site;
  const memberLogin = PANEL_LINKS.admin.replace('/adminpanel/login/', '/login/');

  return (
    <Page title="Membership" crumbs={[{ label: 'Membership' }]}
          description="How to become a member of the club, what it costs, and what members receive.">
      <section className="section">
        <div className="wrap">
          <div className="layout-sidebar">
            <div className="stack">
              <SectionHead kicker="Join us" title="Membership">
                Membership is open to every resident of the ward aged sixteen or above,
                regardless of gender, faith or means.
              </SectionHead>

              <h3>How to apply</h3>
              <div className="grid cols-2">
                {STEPS.map((step) => (
                  <div className="card" key={step.n}>
                    <div className="body">
                      <span className="chip gold">Step {step.n}</span>
                      <h3 style={{ fontSize: '1rem' }}>{step.title}</h3>
                      <p className="excerpt">{step.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <h3>What members receive</h3>
              <ul>
                {BENEFITS.map((benefit) => <li key={benefit}>{benefit}</li>)}
              </ul>

              <div className="notice-strip">
                <strong>Applying online.</strong> The membership form and your member account
                are handled by the club office system. Applications are reviewed by the office
                and you will be told the outcome by e-mail.
              </div>

              <div className="hero-actions" style={{ marginTop: 4 }}>
                <a className="btn btn-gold" href={`${memberLogin}?next=/membership/`}>
                  Apply for membership
                </a>
                <a className="btn btn-outline" href={memberLogin}>Member sign in</a>
                <Link className="btn btn-ghost" to="/contact">Ask a question</Link>
              </div>
            </div>

            <aside className="stack">
              <div className="panel">
                <div className="panel-head">Subscription</div>
                <div className="panel-body">
                  <dl className="kv">
                    <dt>Annual</dt><dd>₹300</dd>
                    <dt>Student</dt><dd>₹150</dd>
                    <dt>Life member</dt><dd>₹5,000 (one time)</dd>
                    <dt>Renewal</dt><dd>Due by 30 September each year</dd>
                  </dl>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">Who may join</div>
                <div className="panel-body" style={{ fontSize: '.92rem' }}>
                  <p>Any resident of the ward aged sixteen or above.</p>
                  <p>
                    Associate membership is available to former residents and to institutions
                    working in the ward.
                  </p>
                  <p style={{ margin: 0 }}>
                    Questions? Call the office on{' '}
                    <a href={`tel:${site.phone}`}>{site.phone}</a>.
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
