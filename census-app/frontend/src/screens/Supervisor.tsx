/** Supervisor dashboard: zone progress, team activity and the review queue. */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { BarChart, CoverageRing, Sparkline, Stat } from '../components/Charts';
import { FlagList } from '../components/FlagList';
import { DownloadIcon } from '../components/Icons';
import { AppShell, EmptyState } from '../components/Layout';
import { Sheet } from '../components/Sheet';
import * as api from '../lib/api';
import { computeAnalytics, needsAttention, sexRatio } from '../lib/analytics';
import { householdsToCsv } from '../lib/household';
import { useApp } from '../lib/store';
import type { Household, ReviewNote } from '../lib/types';
import { downloadText, nowIso, relativeTime, todayKey, uuid } from '../lib/utils';

type Tab = 'overview' | 'team' | 'review';

const REVIEW_ACTION_KEYS: Record<ReviewNote['action'], string> = {
  approved: 'status.approved',
  flagged: 'status.flagged',
  reopened: 'supervisor.reopen',
  comment: 'form.notes',
};

export function SupervisorScreen(): JSX.Element {
  const { t, locale, households, zones, users, session, saveHousehold, backend, toast } = useApp();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('overview');
  const [reviewing, setReviewing] = useState<Household | null>(null);

  const analytics = useMemo(
    () => computeAnalytics(households, zones, users),
    [households, users, zones],
  );

  const pendingReview = useMemo(
    () => households.filter((household) => household.status === 'submitted'),
    [households],
  );

  const attention = useMemo(() => needsAttention(households), [households]);

  const ratio = sexRatio(analytics.genderCounts);

  const applyReview = async (
    household: Household,
    action: ReviewNote['action'],
    text: string,
  ) => {
    const note: ReviewNote = {
      id: uuid(),
      by: session?.user.id ?? 'local',
      byName: session?.user.name ?? '',
      at: nowIso(),
      action,
      text,
    };

    const status =
      action === 'approved' ? 'approved' : action === 'flagged' ? 'flagged' : 'submitted';

    const updated: Household = {
      ...household,
      status,
      reviews: [...household.reviews, note],
    };

    // Save locally first so the decision survives a dropped connection, then
    // tell the server (which records it in the audit log).
    await saveHousehold(updated, { queue: true });

    if (backend) {
      try {
        await api.reviewHousehold(household.id, action, text);
      } catch (error) {
        console.warn('census: review not yet sent to server', error);
      }
    }

    setReviewing(null);
    toast(
      t(
        action === 'approved'
          ? 'supervisor.approved'
          : action === 'flagged'
            ? 'supervisor.flaggedDone'
            : 'supervisor.reopened',
      ),
      'success',
    );
  };

  const downloadReport = () => {
    downloadText(
      `census-report-${todayKey()}.csv`,
      householdsToCsv(households),
      'text/csv',
    );
  };

  return (
    <AppShell title={t('supervisor.title')} subtitle={session?.user.name}>
      <div className="stack">
        <div className="tabs" role="tablist">
          {(['overview', 'team', 'review'] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`tab${tab === value ? ' active' : ''}`}
              onClick={() => setTab(value)}
            >
              {t(
                value === 'overview'
                  ? 'supervisor.overview'
                  : value === 'team'
                    ? 'supervisor.team'
                    : 'supervisor.reviewQueue',
              )}
              {value === 'review' && pendingReview.length ? ` (${pendingReview.length})` : ''}
            </button>
          ))}
        </div>

        {tab === 'overview' ? (
          <>
            <div className="stat-grid">
              <Stat value={analytics.households} label={t('analytics.households')} tone="accent" />
              <Stat value={analytics.members} label={t('analytics.members')} tone="navy" />
              <Stat value={analytics.approved} label={t('households.filter.approved')} tone="green" />
              <Stat value={analytics.flagged} label={t('households.filter.flagged')} tone="danger" />
            </div>

            {analytics.targetHouseholds > 0 ? (
              <section className="card row" style={{ justifyContent: 'space-around' }}>
                <CoverageRing percent={analytics.coverage} label={t('supervisor.coverage')} />
                <div className="stack-sm">
                  <InfoLine
                    label={t('supervisor.collected')}
                    value={analytics.households.toLocaleString('en-IN')}
                  />
                  <InfoLine
                    label={t('supervisor.target')}
                    value={analytics.targetHouseholds.toLocaleString('en-IN')}
                  />
                  <InfoLine
                    label={t('analytics.avgSize')}
                    value={String(analytics.averageHouseholdSize)}
                  />
                  {ratio !== null ? (
                    <InfoLine label={t('analytics.sexRatio')} value={String(ratio)} />
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className="card stack-sm">
              <span className="section-label">{t('analytics.daily')}</span>
              <Sparkline data={analytics.dailyCounts} locale={locale} />
            </section>

            <section className="card stack-sm">
              <span className="section-label">{t('analytics.byZone')}</span>
              <BarChart
                data={analytics.zoneProgress.map((zone) => ({
                  label: zone.zoneName,
                  value: zone.collected,
                  suffix: zone.target ? `/ ${zone.target}` : undefined,
                }))}
              />
            </section>

            <section className="card stack-sm">
              <div className="row-between">
                <span className="section-label">{t('supervisor.suspicious')}</span>
                <span className="badge badge-warning">{attention.length}</span>
              </div>
              <p className="tiny">{t('supervisor.suspiciousHint')}</p>
              {attention.length ? (
                <div className="list">
                  {attention.slice(0, 6).map((household) => (
                    <button
                      key={household.id}
                      type="button"
                      className="list-item"
                      onClick={() => navigate(`/households/${household.id}`)}
                    >
                      <div className="row-between">
                        <span className="title mono">{household.householdNumber}</span>
                        <span className={`badge badge-${household.status}`}>
                          {t(`status.${household.status}`)}
                        </span>
                      </div>
                      <FlagList flags={household.flags} household={household} limit={2} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">{t('supervisor.noPending')}</p>
              )}
            </section>

            <button type="button" className="btn btn-outline btn-block" onClick={downloadReport}>
              <DownloadIcon />
              {t('supervisor.downloadReport')}
            </button>
          </>
        ) : null}

        {tab === 'team' ? (
          <section className="card stack-sm">
            <span className="section-label">{t('analytics.byEnumerator')}</span>
            {analytics.enumeratorProgress.length ? (
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t('admin.userName')}</th>
                      <th>{t('supervisor.collected')}</th>
                      <th>{t('households.filter.submitted')}</th>
                      <th>{t('households.filter.approved')}</th>
                      <th>{t('households.filter.flagged')}</th>
                      <th>{t('supervisor.lastActivity')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.enumeratorProgress.map((row) => (
                      <tr key={row.enumeratorId}>
                        <td>{row.name}</td>
                        <td>{row.collected}</td>
                        <td>{row.submitted}</td>
                        <td>{row.approved}</td>
                        <td>{row.flagged}</td>
                        <td>{relativeTime(row.lastActivity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="👥" title={t('supervisor.noTeam')} />
            )}
          </section>
        ) : null}

        {tab === 'review' ? (
          pendingReview.length ? (
            <div className="list">
              {pendingReview.map((household) => (
                <div className="card stack-sm" key={household.id}>
                  <div className="row-between">
                    <span className="title mono">{household.householdNumber}</span>
                    <span className="badge badge-submitted">{t('status.submitted')}</span>
                  </div>
                  <div className="meta tiny">
                    {household.enumeratorName} · {relativeTime(household.submittedAt)} ·{' '}
                    {t('households.members', { count: household.members.length })}
                  </div>
                  <FlagList flags={household.flags} household={household} limit={3} />
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm grow"
                      onClick={() => navigate(`/households/${household.id}`)}
                    >
                      {t('common.view')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm grow"
                      onClick={() => setReviewing(household)}
                    >
                      {t('supervisor.reviewQueue')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              <EmptyState icon="✅" title={t('supervisor.noPending')} />
            </div>
          )
        ) : null}
      </div>

      {reviewing ? (
        <ReviewSheet
          household={reviewing}
          onClose={() => setReviewing(null)}
          onSubmit={(action, text) => void applyReview(reviewing, action, text)}
        />
      ) : null}
    </AppShell>
  );
}

function ReviewSheet({
  household,
  onClose,
  onSubmit,
}: {
  household: Household;
  onClose: () => void;
  onSubmit: (action: ReviewNote['action'], text: string) => void;
}): JSX.Element {
  const { t } = useApp();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = (action: ReviewNote['action']) => {
    if (action !== 'approved' && !note.trim()) {
      setError(t('supervisor.reviewRequired'));
      return;
    }
    onSubmit(action, note.trim());
  };

  return (
    <Sheet
      title={household.householdNumber}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-danger" onClick={() => act('flagged')}>
            {t('supervisor.flag')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => act('approved')}>
            {t('supervisor.approve')}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="stat-grid">
          <Stat value={household.members.length} label={t('analytics.members')} />
          <Stat
            value={household.location ? '✓' : '—'}
            label={t('form.section.location')}
            tone={household.location ? 'green' : 'danger'}
          />
        </div>

        <FlagList flags={household.flags} household={household} />

        {household.notes ? (
          <section className="stack-sm">
            <span className="section-label">{t('form.notes')}</span>
            <p className="muted">{household.notes}</p>
          </section>
        ) : null}

        <div className="field">
          <label className="field-label" htmlFor="review-note">
            {t('supervisor.reviewNote')}
          </label>
          <textarea
            id="review-note"
            rows={3}
            value={note}
            placeholder={t('supervisor.reviewNotePlaceholder')}
            onChange={(event) => {
              setNote(event.target.value);
              setError(null);
            }}
          />
          {error ? <span className="error-text">{error}</span> : null}
        </div>

        {household.reviews.length ? (
          <section className="stack-sm">
            <span className="section-label">{t('supervisor.reports')}</span>
            {household.reviews.map((review) => (
              <div className="banner banner-info" key={review.id}>
                <div>
                  <strong>
                    {review.byName} · {t(REVIEW_ACTION_KEYS[review.action])}
                  </strong>
                  {review.text}
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}

function InfoLine({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="tiny">{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}
