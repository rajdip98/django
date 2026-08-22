/** Administrator panel: analytics, user and zone management, export, audit log.
 *
 * Analytics and export work from the device cache so the panel is useful even
 * offline; user/zone management and the audit log need the census server. */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { BarChart, CoverageRing, DistributionChart, Sparkline, Stat } from '../components/Charts';
import { DownloadIcon, PlusIcon, TrashIcon } from '../components/Icons';
import { AppShell, Banner, EmptyState } from '../components/Layout';
import { ConfirmSheet, Sheet } from '../components/Sheet';
import { LANGUAGES, translationCoverage } from '../i18n';
import * as api from '../lib/api';
import { computeAnalytics, sexRatio } from '../lib/analytics';
import { householdsToCsv, makeBackup, membersToCsv } from '../lib/household';
import { useApp } from '../lib/store';
import type { AnalyticsSummary, AuditEntry, Role, User, Zone } from '../lib/types';
import { LookupTab } from './admin/LookupTab';
import { MapLinksTab } from './admin/MapLinksTab';
import { NoticesTab } from './admin/NoticesTab';
import { QualityTab } from './admin/QualityTab';
import { downloadText, formatDateTime, isValidMobile, percent, todayKey } from '../lib/utils';

type Tab =
  | 'analytics'
  | 'quality'
  | 'maps'
  | 'notices'
  | 'lookup'
  | 'users'
  | 'zones'
  | 'export'
  | 'audit';

// Ordered by how often an administrator reaches for them during a live census:
// the numbers first, then the things that need acting on, then configuration.
const TABS: Array<{ value: Tab; labelKey: string }> = [
  { value: 'analytics', labelKey: 'admin.tab.analytics' },
  { value: 'quality', labelKey: 'admin.tab.quality' },
  { value: 'maps', labelKey: 'admin.tab.maps' },
  { value: 'notices', labelKey: 'admin.tab.notices' },
  { value: 'lookup', labelKey: 'admin.tab.lookup' },
  { value: 'users', labelKey: 'admin.tab.users' },
  { value: 'zones', labelKey: 'admin.tab.zones' },
  { value: 'export', labelKey: 'admin.tab.export' },
  { value: 'audit', labelKey: 'admin.tab.audit' },
];

const ROLE_OPTIONS: Role[] = ['enumerator', 'supervisor', 'admin', 'citizen'];

export function AdminScreen(): JSX.Element {
  const { t, backend } = useApp();
  const [tab, setTab] = useState<Tab>('analytics');

  return (
    <AppShell title={t('admin.title')} subtitle={backend ? backend.database : t('sync.deviceOnly')}>
      <div className="stack">
        <div className="tabs" role="tablist">
          {TABS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={tab === option.value}
              className={`tab${tab === option.value ? ' active' : ''}`}
              onClick={() => setTab(option.value)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>

        {tab === 'analytics' ? <AnalyticsTab /> : null}
        {tab === 'quality' ? <QualityTab /> : null}
        {tab === 'maps' ? <MapLinksTab /> : null}
        {tab === 'notices' ? <NoticesTab /> : null}
        {tab === 'lookup' ? <LookupTab /> : null}
        {tab === 'users' ? <UsersTab /> : null}
        {tab === 'zones' ? <ZonesTab /> : null}
        {tab === 'export' ? <ExportTab /> : null}
        {tab === 'audit' ? <AuditTab /> : null}
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

function AnalyticsTab(): JSX.Element {
  const { t, locale, households, zones, users, backend } = useApp();
  const [remote, setRemote] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const local = useMemo(
    () => computeAnalytics(households, zones, users),
    [households, users, zones],
  );

  useEffect(() => {
    if (!backend) {
      setRemote(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .analytics()
      .then((summary) => {
        if (!cancelled) setRemote(summary);
      })
      .catch((error) => {
        console.warn('census: server analytics unavailable', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const summary = remote ?? local;
  const ratio = sexRatio(summary.genderCounts);
  const coverage = translationCoverage();

  return (
    <div className="stack">
      {loading ? <p className="tiny">{t('common.loading')}</p> : null}
      {!backend ? (
        <Banner kind="info" icon="📴">
          {t('admin.exportScopeLocal')}
        </Banner>
      ) : null}

      <div className="stat-grid">
        <Stat value={summary.households} label={t('analytics.households')} tone="accent" />
        <Stat value={summary.members} label={t('analytics.members')} tone="navy" />
        <Stat value={summary.approved} label={t('households.filter.approved')} tone="green" />
        <Stat value={summary.flagged} label={t('households.filter.flagged')} tone="danger" />
        <Stat value={summary.averageHouseholdSize} label={t('analytics.avgSize')} />
        <Stat value={ratio ?? '—'} label={t('analytics.sexRatio')} />
      </div>

      {summary.targetHouseholds > 0 ? (
        <section className="card row" style={{ justifyContent: 'space-around' }}>
          <CoverageRing percent={summary.coverage} label={t('analytics.coverage')} />
          <div className="stack-sm">
            <div>
              <div className="tiny">{t('supervisor.collected')}</div>
              <div style={{ fontWeight: 700 }}>{summary.households.toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div className="tiny">{t('supervisor.target')}</div>
              <div style={{ fontWeight: 700 }}>
                {summary.targetHouseholds.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="card stack-sm">
        <span className="section-label">{t('analytics.daily')}</span>
        <Sparkline data={summary.dailyCounts} locale={locale} />
      </section>

      <section className="card stack-sm">
        <span className="section-label">{t('analytics.gender')}</span>
        <DistributionChart counts={summary.genderCounts} keyPrefix="opt.gender." />
      </section>

      <section className="card stack-sm">
        <span className="section-label">{t('analytics.ageBands')}</span>
        <BarChart
          data={Object.entries(summary.ageBands).map(([key, value]) => ({
            label: t(key),
            value,
          }))}
        />
      </section>

      <section className="card stack-sm">
        <span className="section-label">{t('analytics.literacy')}</span>
        <BarChart
          data={[
            {
              label: t('analytics.literate'),
              value: summary.literacy.literate,
              color: 'var(--green)',
            },
            {
              label: t('analytics.illiterate'),
              value: summary.literacy.illiterate,
              color: 'var(--saffron)',
            },
          ]}
        />
        <p className="tiny">
          {percent(
            summary.literacy.literate,
            summary.literacy.literate + summary.literacy.illiterate,
          )}
          % {t('analytics.literate').toLowerCase()}
        </p>
      </section>

      <section className="card stack-sm">
        <span className="section-label">{t('analytics.caste')}</span>
        <DistributionChart counts={summary.casteCounts} keyPrefix="opt.caste." />
      </section>

      <section className="card stack-sm">
        <span className="section-label">{t('analytics.religion')}</span>
        <DistributionChart counts={summary.religionCounts} keyPrefix="opt.religion." />
      </section>

      <section className="card stack-sm">
        <span className="section-label">{t('analytics.byZone')}</span>
        <BarChart
          data={summary.zoneProgress.map((zone) => ({
            label: zone.zoneName,
            value: zone.collected,
            suffix: zone.target ? `/ ${zone.target}` : undefined,
          }))}
        />
      </section>

      <section className="card stack-sm">
        <span className="section-label">{t('analytics.byEnumerator')}</span>
        <BarChart
          data={summary.enumeratorProgress.map((row) => ({
            label: row.name,
            value: row.collected,
          }))}
        />
      </section>

      <section className="card stack-sm">
        <span className="section-label">{t('admin.translationCoverage')}</span>
        <BarChart
          data={coverage.map((row) => ({
            label:
              LANGUAGES.find((language) => language.code === row.code)?.nativeName ?? row.code,
            value: Math.round((row.translated / Math.max(1, row.total)) * 100),
            suffix: '%',
          }))}
          max={100}
          formatValue={(value) => `${value}`}
        />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

function UsersTab(): JSX.Element {
  const { t, users, setUsers, zones, backend, toast } = useApp();
  const [editing, setEditing] = useState<Partial<User> | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!backend) return;
    setLoading(true);
    try {
      setUsers(await api.listUsers());
    } catch (error) {
      console.warn('census: could not load users', error);
    } finally {
      setLoading(false);
    }
  }, [backend, setUsers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (draft: Partial<User>) => {
    if (!backend) {
      toast(t('admin.serverRequired'), 'error');
      return;
    }
    if (!draft.name?.trim()) {
      toast(t('login.nameRequired'), 'error');
      return;
    }
    if (draft.role !== 'admin' && !isValidMobile(draft.mobile ?? '')) {
      toast(t('login.invalidMobile'), 'error');
      return;
    }
    try {
      await api.saveUser(draft);
      await refresh();
      setEditing(null);
      toast(t('admin.userSaved'), 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error');
    }
  };

  const remove = async (user: User) => {
    try {
      await api.deleteUser(user.id);
      await refresh();
      setRemoving(null);
      toast(t('common.done'), 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error');
    }
  };

  return (
    <div className="stack">
      {!backend ? (
        <Banner kind="warning" icon="⚠">
          {t('admin.serverRequired')}
        </Banner>
      ) : null}

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!backend}
        onClick={() =>
          setEditing({ name: '', mobile: '', role: 'enumerator', zoneIds: [], active: true })
        }
      >
        <PlusIcon />
        {t('admin.addUser')}
      </button>

      {loading ? <p className="tiny">{t('common.loading')}</p> : null}

      {users.length ? (
        <div className="list">
          {users.map((user) => (
            <div className="card stack-sm" key={user.id}>
              <div className="row-between">
                <span className="title">{user.name}</span>
                <span className={`badge ${user.active ? 'badge-approved' : 'badge-draft'}`}>
                  {t(`role.${user.role}`)}
                </span>
              </div>
              <div className="meta tiny">
                {user.mobile || '—'}
                {user.employeeCode ? ` · ${user.employeeCode}` : ''}
              </div>
              <div className="meta tiny">
                {user.zoneIds.length
                  ? user.zoneIds
                      .map((id) => zones.find((zone) => zone.id === id)?.name ?? id)
                      .join(', ')
                  : t('home.noZone')}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm grow"
                  disabled={!backend}
                  onClick={() => setEditing(user)}
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={!backend}
                  onClick={() => setRemoving(user)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="👤" title={t('admin.noUsers')} />
        </div>
      )}

      {editing ? (
        <UserSheet
          draft={editing}
          zones={zones}
          onClose={() => setEditing(null)}
          onSave={(next) => void save(next)}
        />
      ) : null}

      {removing ? (
        <ConfirmSheet
          title={t('common.delete')}
          message={t('admin.userDeleteConfirm', { name: removing.name })}
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={() => void remove(removing)}
        />
      ) : null}
    </div>
  );
}

function UserSheet({
  draft,
  zones,
  onClose,
  onSave,
}: {
  draft: Partial<User>;
  zones: Zone[];
  onClose: () => void;
  onSave: (user: Partial<User>) => void;
}): JSX.Element {
  const { t } = useApp();
  const [form, setForm] = useState<Partial<User>>(draft);

  const toggleZone = (id: string) => {
    const current = form.zoneIds ?? [];
    setForm({
      ...form,
      zoneIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    });
  };

  return (
    <Sheet
      title={form.id ? t('admin.editUser') : t('admin.addUser')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(form)}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <label className="field-label" htmlFor="user-name">
            {t('admin.userName')}
          </label>
          <input
            id="user-name"
            value={form.name ?? ''}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="user-mobile">
            {t('admin.userMobile')}
          </label>
          <input
            id="user-mobile"
            type="tel"
            inputMode="numeric"
            maxLength={14}
            value={form.mobile ?? ''}
            onChange={(event) => setForm({ ...form, mobile: event.target.value })}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="user-code">
            {t('admin.userCode')}
          </label>
          <input
            id="user-code"
            value={form.employeeCode ?? ''}
            onChange={(event) => setForm({ ...form, employeeCode: event.target.value })}
          />
        </div>

        <div className="field">
          <span className="field-label">{t('admin.userRole')}</span>
          <div className="chip-group">
            {ROLE_OPTIONS.map((role) => (
              <button
                key={role}
                type="button"
                className={`chip${form.role === role ? ' selected' : ''}`}
                aria-pressed={form.role === role}
                onClick={() => setForm({ ...form, role })}
              >
                {t(`role.${role}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">{t('admin.userZones')}</span>
          {zones.length ? (
            <div className="chip-group">
              {zones.map((zone) => {
                const selected = (form.zoneIds ?? []).includes(zone.id);
                return (
                  <button
                    key={zone.id}
                    type="button"
                    className={`chip${selected ? ' selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => toggleZone(zone.id)}
                  >
                    {selected ? '✓ ' : ''}
                    {zone.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="tiny">{t('admin.noZones')}</p>
          )}
        </div>

        <div className="switch-row">
          <span>{t('admin.userActive')}</span>
          <div className="tri-toggle">
            <button
              type="button"
              className={form.active !== false ? 'on' : ''}
              onClick={() => setForm({ ...form, active: true })}
            >
              {t('common.yes')}
            </button>
            <button
              type="button"
              className={form.active === false ? 'off' : ''}
              onClick={() => setForm({ ...form, active: false })}
            >
              {t('common.no')}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Zones                                                               */
/* ------------------------------------------------------------------ */

function ZonesTab(): JSX.Element {
  const { t, zones, setZones, households, backend, toast } = useApp();
  const [editing, setEditing] = useState<Partial<Zone> | null>(null);
  const [removing, setRemoving] = useState<Zone | null>(null);

  const refresh = useCallback(async () => {
    if (!backend) return;
    try {
      setZones(await api.listZones());
    } catch (error) {
      console.warn('census: could not load zones', error);
    }
  }, [backend, setZones]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (draft: Partial<Zone>) => {
    if (!backend) {
      toast(t('admin.serverRequired'), 'error');
      return;
    }
    if (!draft.name?.trim() || !draft.code?.trim()) {
      toast(t('common.required'), 'error');
      return;
    }
    try {
      await api.saveZone(draft);
      await refresh();
      setEditing(null);
      toast(t('admin.zoneSaved'), 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error');
    }
  };

  const remove = async (zone: Zone) => {
    try {
      await api.deleteZone(zone.id);
      await refresh();
      setRemoving(null);
      toast(t('common.done'), 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error');
    }
  };

  return (
    <div className="stack">
      {!backend ? (
        <Banner kind="warning" icon="⚠">
          {t('admin.serverRequired')}
        </Banner>
      ) : null}

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!backend}
        onClick={() =>
          setEditing({
            code: '',
            name: '',
            district: '',
            state: '',
            targetHouseholds: 100,
            assignedTo: [],
          })
        }
      >
        <PlusIcon />
        {t('admin.addZone')}
      </button>

      {zones.length ? (
        <div className="list">
          {zones.map((zone) => {
            const collected = households.filter(
              (household) => household.zoneId === zone.id,
            ).length;
            return (
              <div className="card stack-sm" key={zone.id}>
                <div className="row-between">
                  <span className="title">{zone.name}</span>
                  <span className="badge badge-submitted mono">{zone.code}</span>
                </div>
                <div className="meta tiny">
                  {[zone.district, zone.state].filter(Boolean).join(', ') || '—'}
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(100, percent(collected, zone.targetHouseholds))}%` }}
                  />
                </div>
                <div className="tiny">
                  {collected} / {zone.targetHouseholds} ·{' '}
                  {percent(collected, zone.targetHouseholds)}%
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm grow"
                    disabled={!backend}
                    onClick={() => setEditing(zone)}
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={!backend}
                    onClick={() => setRemoving(zone)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="🗺️" title={t('admin.noZones')} />
        </div>
      )}

      {editing ? (
        <ZoneSheet
          draft={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => void save(next)}
        />
      ) : null}

      {removing ? (
        <ConfirmSheet
          title={t('common.delete')}
          message={t('admin.zoneDeleteConfirm', { name: removing.name })}
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={() => void remove(removing)}
        />
      ) : null}
    </div>
  );
}

function ZoneSheet({
  draft,
  onClose,
  onSave,
}: {
  draft: Partial<Zone>;
  onClose: () => void;
  onSave: (zone: Partial<Zone>) => void;
}): JSX.Element {
  const { t } = useApp();
  const [form, setForm] = useState<Partial<Zone>>(draft);

  return (
    <Sheet
      title={form.id ? t('admin.editZone') : t('admin.addZone')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(form)}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <label className="field-label" htmlFor="zone-code">
            {t('admin.zoneCode')}
          </label>
          <input
            id="zone-code"
            value={form.code ?? ''}
            onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="zone-name">
            {t('admin.zoneName')}
          </label>
          <input
            id="zone-name"
            value={form.name ?? ''}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="zone-district">
              {t('admin.zoneDistrict')}
            </label>
            <input
              id="zone-district"
              value={form.district ?? ''}
              onChange={(event) => setForm({ ...form, district: event.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="zone-state">
              {t('admin.zoneState')}
            </label>
            <input
              id="zone-state"
              value={form.state ?? ''}
              onChange={(event) => setForm({ ...form, state: event.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="zone-target">
            {t('admin.zoneTarget')}
          </label>
          <input
            id="zone-target"
            type="number"
            inputMode="numeric"
            min={0}
            value={form.targetHouseholds ?? 0}
            onChange={(event) =>
              setForm({
                ...form,
                targetHouseholds: Math.max(0, Number.parseInt(event.target.value, 10) || 0),
              })
            }
          />
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function ExportTab(): JSX.Element {
  const { t, households, backend } = useApp();
  const stamp = todayKey();

  return (
    <div className="stack">
      <Banner kind="info" icon="⬇">
        {backend ? t('admin.exportScopeServer') : t('admin.exportScopeLocal')}
      </Banner>
      <p className="muted">{t('admin.exportHint')}</p>

      <section className="card stack-sm">
        <span className="section-label">{t('admin.exportScopeLocal')}</span>
        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() =>
            downloadText(`census-households-${stamp}.csv`, householdsToCsv(households), 'text/csv')
          }
        >
          <DownloadIcon />
          {t('admin.exportHouseholdsCsv')}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() =>
            downloadText(`census-members-${stamp}.csv`, membersToCsv(households), 'text/csv')
          }
        >
          <DownloadIcon />
          {t('admin.exportMembersCsv')}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() =>
            downloadText(
              `census-full-${stamp}.json`,
              JSON.stringify(makeBackup(households), null, 2),
              'application/json',
            )
          }
        >
          <DownloadIcon />
          {t('admin.exportJson')}
        </button>
        <p className="tiny">
          {households.length} {t('analytics.households').toLowerCase()}
        </p>
      </section>

      {backend ? (
        <section className="card stack-sm">
          <span className="section-label">{t('admin.exportScopeServer')}</span>
          <a
            className="btn btn-outline btn-block"
            href={api.exportUrl('csv', 'households')}
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon />
            {t('admin.exportHouseholdsCsv')}
          </a>
          <a
            className="btn btn-outline btn-block"
            href={api.exportUrl('csv', 'members')}
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon />
            {t('admin.exportMembersCsv')}
          </a>
          <a
            className="btn btn-outline btn-block"
            href={api.exportUrl('json', 'households')}
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon />
            {t('admin.exportJson')}
          </a>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

function AuditTab(): JSX.Element {
  const { t, locale, backend } = useApp();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    setLoading(true);
    api
      .auditLog()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((error) => console.warn('census: audit log unavailable', error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  if (!backend) {
    return (
      <Banner kind="warning" icon="⚠">
        {t('admin.serverRequired')}
      </Banner>
    );
  }

  if (loading) return <p className="tiny">{t('common.loading')}</p>;

  if (!entries.length) {
    return (
      <div className="card">
        <EmptyState icon="📋" title={t('admin.auditEmpty')} />
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>{t('admin.auditTime')}</th>
            <th>{t('admin.auditActor')}</th>
            <th>{t('admin.auditAction')}</th>
            <th>{t('admin.auditTarget')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{formatDateTime(entry.at, locale)}</td>
              <td>{entry.actorName || entry.actorId}</td>
              <td>{entry.action}</td>
              <td title={entry.detail}>{entry.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
