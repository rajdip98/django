/** Role-aware home dashboard. */

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Stat } from '../components/Charts';
import { DownloadIcon, PlusIcon, SyncIcon } from '../components/Icons';
import { AppShell, Banner, EmptyState } from '../components/Layout';
import { useInstallPrompt } from '../lib/install';
import { useApp } from '../lib/store';
import type { Household, Notice } from '../lib/types';
import { formatDateTime, relativeTime, todayKey } from '../lib/utils';

function HouseholdRow({ household }: { household: Household }): JSX.Element {
  const { t, locale } = useApp();
  const memberLabel =
    household.members.length === 1
      ? t('households.member')
      : t('households.members', { count: household.members.length });

  return (
    <Link className="list-item" to={`/households/${household.id}`}>
      <div className="row-between">
        <span className="title mono">{household.householdNumber}</span>
        <span className={`badge badge-${household.status}`}>{t(`status.${household.status}`)}</span>
      </div>
      <div className="meta">
        {[household.address.houseNumber, household.address.village || household.address.locality]
          .filter(Boolean)
          .join(', ') || t('common.notSet')}
      </div>
      <div className="meta">
        {memberLabel} · {relativeTime(household.updatedAt)}
        {household.sync === 'pending' ? ` · ${t('sync.pending', { count: 1 })}` : ''}
      </div>
      <span className="sr-only">{formatDateTime(household.updatedAt, locale)}</span>
    </Link>
  );
}

export function HomeScreen(): JSX.Element {
  const {
    t,
    session,
    households,
    zones,
    notices,
    pendingCount,
    syncNow,
    syncing,
    deviceOnly,
    toast,
  } = useApp();
  const navigate = useNavigate();
  const install = useInstallPrompt();

  const role = session?.user.role ?? 'enumerator';

  const stats = useMemo(() => {
    const today = todayKey();
    let submitted = 0;
    let drafts = 0;
    let members = 0;
    let todayCount = 0;

    for (const household of households) {
      if (household.status === 'draft') drafts += 1;
      else submitted += 1;
      members += household.members.length;
      if (todayKey(household.createdAt) === today) todayCount += 1;
    }

    return { submitted, drafts, members, todayCount };
  }, [households]);

  const zone = zones.find((candidate) => session?.user.zoneIds.includes(candidate.id));
  const recent = households.slice(0, 5);

  const myHousehold = role === 'citizen' ? households[0] : undefined;

  const handleInstall = async () => {
    const outcome = await install.promptInstall();
    if (outcome === 'unavailable') toast(t('profile.installUnavailable'), 'info');
  };

  return (
    <AppShell title={t('app.shortTitle')} subtitle={t(`role.${role}`)}>
      <div className="stack">
        <section className="card">
          <h2 style={{ fontSize: '1.15rem' }}>
            {t('home.greeting', { name: session?.user.name || t('role.' + role) })}
          </h2>
          <p className="muted" style={{ marginTop: 2 }}>
            {zone
              ? `${t('home.assignedZone')}: ${zone.name} (${zone.code})`
              : role === 'citizen'
                ? t('home.selfEnumerationDesc')
                : t('home.noZone')}
          </p>
        </section>

        {deviceOnly ? (
          <Banner kind="warning" icon="📴" title={t('sync.deviceOnly')}>
            {t('sync.deviceOnlyHint')}
          </Banner>
        ) : null}

        <NoticeBoard notices={notices} />

        {role === 'citizen' ? (
          <CitizenPanel household={myHousehold} />
        ) : (
          <>
            <div className="stat-grid">
              <Stat value={households.length} label={t('home.stats.total')} tone="accent" />
              <Stat value={stats.submitted} label={t('home.stats.submitted')} tone="green" />
              <Stat value={stats.drafts} label={t('home.stats.drafts')} />
              <Stat value={stats.members} label={t('home.stats.members')} tone="navy" />
            </div>

            <section className="card stack-sm">
              <span className="section-label">{t('home.quickActions')}</span>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => navigate('/households/new')}
              >
                <PlusIcon />
                {t('home.newHousehold')}
              </button>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline grow"
                  onClick={() => void syncNow()}
                  disabled={deviceOnly || syncing}
                >
                  <SyncIcon />
                  {syncing ? t('sync.syncing') : t('home.syncNow')}
                </button>
                {role === 'supervisor' ? (
                  <Link className="btn btn-outline grow" to="/supervisor">
                    {t('home.openDashboard')}
                  </Link>
                ) : null}
                {role === 'admin' ? (
                  <Link className="btn btn-outline grow" to="/admin">
                    {t('home.openAdmin')}
                  </Link>
                ) : null}
              </div>
              {pendingCount > 0 && !deviceOnly ? (
                <p className="tiny">{t('sync.pending', { count: pendingCount })}</p>
              ) : null}
            </section>
          </>
        )}

        {install.available && !install.installed ? (
          <section className="card row-between">
            <div className="grow">
              <div className="card-title">{t('home.installPrompt')}</div>
              <p className="tiny">{t('profile.installHint')}</p>
            </div>
            <button type="button" className="btn btn-accent btn-sm" onClick={() => void handleInstall()}>
              <DownloadIcon />
              {t('home.install')}
            </button>
          </section>
        ) : null}

        <section className="stack-sm">
          <div className="row-between">
            <span className="section-label">{t('home.recent')}</span>
            {households.length > 5 ? (
              <Link className="btn btn-ghost btn-sm" to="/households">
                {t('home.viewAll')}
              </Link>
            ) : null}
          </div>

          {recent.length ? (
            <div className="list">
              {recent.map((household) => (
                <HouseholdRow key={household.id} household={household} />
              ))}
            </div>
          ) : (
            <div className="card">
              <EmptyState
                icon="🏠"
                title={t('home.noRecent')}
                hint={role === 'citizen' ? undefined : t('households.emptyHint')}
              />
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

/** Announcements from the administrator, urgent first. */
function NoticeBoard({ notices }: { notices: Notice[] }): JSX.Element | null {
  const { t, locale } = useApp();
  const active = notices.filter((notice) => notice.active);
  if (!active.length) return null;

  const tone = (notice: Notice): 'error' | 'warning' | 'info' =>
    notice.level === 'urgent' ? 'error' : notice.level === 'important' ? 'warning' : 'info';

  return (
    <section className="stack-sm">
      <span className="section-label">{t('notices.forYou')}</span>
      {active.slice(0, 4).map((notice) => (
        <Banner key={notice.id} kind={tone(notice)} icon="📣" title={notice.title}>
          <span style={{ whiteSpace: 'pre-wrap' }}>{notice.body}</span>
          <div className="tiny" style={{ marginTop: 4 }}>
            {t('notices.from', { name: notice.createdByName || t('role.admin') })} ·{' '}
            {formatDateTime(notice.createdAt, locale)}
          </div>
        </Banner>
      ))}
    </section>
  );
}

function CitizenPanel({ household }: { household?: Household }): JSX.Element {
  const { t, toast } = useApp();
  const navigate = useNavigate();

  const copyAck = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast(t('common.copied'), 'success');
    } catch {
      toast(code, 'info');
    }
  };

  if (!household) {
    return (
      <section className="card stack-sm">
        <span className="section-label">{t('home.selfEnumeration')}</span>
        <p className="muted">{t('home.selfEnumerationDesc')}</p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => navigate('/households/new')}
        >
          <PlusIcon />
          {t('home.startSelfEnumeration')}
        </button>
      </section>
    );
  }

  return (
    <section className="card stack-sm">
      <div className="row-between">
        <span className="section-label">{t('home.selfEnumeration')}</span>
        <span className={`badge badge-${household.status}`}>{t(`status.${household.status}`)}</span>
      </div>

      {household.acknowledgementId ? (
        <>
          <span className="section-label" style={{ marginTop: 6 }}>
            {t('home.acknowledgement')}
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void copyAck(household.acknowledgementId as string)}
          >
            <span className="mono" style={{ fontSize: '1.05rem', letterSpacing: '0.06em' }}>
              {household.acknowledgementId}
            </span>
          </button>
          <p className="tiny">{t('home.acknowledgementHint')}</p>
        </>
      ) : null}

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => navigate(`/households/${household.id}`)}
      >
        {household.status === 'draft' ? t('home.startSelfEnumeration') : t('home.editMyHousehold')}
      </button>
    </section>
  );
}
