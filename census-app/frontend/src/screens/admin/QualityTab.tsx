/** Double counting, coverage gaps and incomplete records.
 *
 * The checks run on the census server rather than on whatever the device
 * happens to hold, because a duplicate is by definition a pair of records that
 * two different enumerators collected — neither device can see both.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Stat } from '../../components/Charts';
import { LocationIcon, WarningIcon } from '../../components/Icons';
import { Banner, EmptyState } from '../../components/Layout';
import * as api from '../../lib/api';
import { googleMapsUrl } from '../../lib/maps';
import { useApp } from '../../lib/store';
import type { DuplicateCluster, QualityHousehold, QualityReport } from '../../lib/types';
import { formatDateTime, relativeTime } from '../../lib/utils';

export function QualityTab(): JSX.Element {
  const { t, locale, backend, zones, households, toast } = useApp();
  const navigate = useNavigate();

  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoneId, setZoneId] = useState('');
  const [radius, setRadius] = useState(25);

  const run = useCallback(async () => {
    if (!backend) return;
    setLoading(true);
    try {
      setReport(await api.qualityReport({ zoneId: zoneId || undefined, radius }));
    } catch (error) {
      console.error('census: quality report failed', error);
      toast(error instanceof Error ? error.message : t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [backend, radius, t, toast, zoneId]);

  useEffect(() => {
    void run();
    // Only on first mount; re-running is an explicit action because the check
    // is expensive on a large dataset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);

  /** Only offer a link into the form when the record is actually on this device. */
  const openable = (id: string) => households.some((household) => household.id === id);

  if (!backend) {
    return (
      <Banner kind="warning" icon="⚠">
        {t('quality.serverOnly')}
      </Banner>
    );
  }

  return (
    <div className="stack">
      <Banner kind="info" icon="🔎">
        {t('quality.hint')}
      </Banner>

      <section className="card stack-sm">
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="quality-zone">
              {t('form.zone')}
            </label>
            <select
              id="quality-zone"
              value={zoneId}
              onChange={(event) => setZoneId(event.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="quality-radius">
              {t('quality.radius')}
            </label>
            <input
              id="quality-radius"
              type="number"
              inputMode="numeric"
              min={5}
              max={500}
              value={radius}
              onChange={(event) =>
                setRadius(Math.min(500, Math.max(5, Number.parseInt(event.target.value, 10) || 25)))
              }
            />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => void run()}
          disabled={loading}
        >
          {loading ? t('quality.running') : t('quality.run')}
        </button>
        {report?.generatedAt ? (
          <p className="tiny">
            {t('quality.generatedAt', { time: formatDateTime(report.generatedAt, locale) })}
          </p>
        ) : null}
      </section>

      {report ? (
        <>
          <div className="stat-grid">
            <Stat value={report.counts.reviewed} label={t('quality.reviewed')} tone="navy" />
            <Stat
              value={report.counts.duplicateClusters}
              label={t('quality.duplicates')}
              tone={report.counts.duplicateClusters ? 'danger' : 'green'}
            />
            <Stat
              value={report.counts.missingLocation}
              label={t('quality.missingLocation')}
              tone={report.counts.missingLocation ? 'accent' : undefined}
            />
            <Stat
              value={report.counts.withIssues}
              label={t('quality.withIssues')}
              tone={report.counts.withIssues ? 'accent' : undefined}
            />
          </div>

          {report.counts.duplicateClusters === 0 &&
          report.counts.missingLocation === 0 &&
          report.counts.unassigned === 0 &&
          report.counts.withIssues === 0 ? (
            <div className="card">
              <EmptyState icon="✅" title={t('quality.clean')} hint={t('quality.cleanHint')} />
            </div>
          ) : null}

          {report.duplicates.length ? (
            <section className="card stack-sm">
              <div className="row-between">
                <span className="section-label">{t('quality.section.duplicates')}</span>
                <span className="badge badge-flagged">
                  {t('quality.duplicateHouseholds')}: {report.counts.duplicateHouseholds}
                </span>
              </div>
              {report.duplicates.map((cluster, index) => (
                <DuplicateCard
                  key={`${cluster.reason}-${index}`}
                  cluster={cluster}
                  openable={openable}
                  onOpen={(id) => navigate(`/households/${id}`)}
                />
              ))}
            </section>
          ) : null}

          <IssueSection
            titleKey="quality.section.withIssues"
            rows={report.withIssues}
            openable={openable}
            onOpen={(id) => navigate(`/households/${id}`)}
            showIssues
          />
          <IssueSection
            titleKey="quality.section.missingLocation"
            rows={report.missingLocation}
            openable={openable}
            onOpen={(id) => navigate(`/households/${id}`)}
          />
          <IssueSection
            titleKey="quality.section.unassigned"
            rows={report.unassigned}
            openable={openable}
            onOpen={(id) => navigate(`/households/${id}`)}
          />
        </>
      ) : loading ? (
        <p className="tiny">{t('quality.running')}</p>
      ) : null}
    </div>
  );
}

function DuplicateCard({
  cluster,
  openable,
  onOpen,
}: {
  cluster: DuplicateCluster;
  openable: (id: string) => boolean;
  onOpen: (id: string) => void;
}): JSX.Element {
  const { t } = useApp();

  const reason =
    cluster.reason === 'location'
      ? t('quality.reason.location', { meters: cluster.distanceMeters ?? 0 })
      : t('quality.reason.address');

  return (
    <div className="banner banner-error" style={{ display: 'block' }}>
      <strong>
        <WarningIcon className="sr-only" /> {reason}
      </strong>
      <div className="list" style={{ marginTop: 8 }}>
        {cluster.households.map((household) => (
          <QualityRow
            key={household.id}
            household={household}
            openable={openable}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

function IssueSection({
  titleKey,
  rows,
  openable,
  onOpen,
  showIssues = false,
}: {
  titleKey: string;
  rows: QualityHousehold[];
  openable: (id: string) => boolean;
  onOpen: (id: string) => void;
  showIssues?: boolean;
}): JSX.Element | null {
  const { t } = useApp();
  if (!rows.length) return null;

  return (
    <section className="card stack-sm">
      <div className="row-between">
        <span className="section-label">{t(titleKey)}</span>
        <span className="badge badge-warning">{rows.length}</span>
      </div>
      <div className="list">
        {rows.map((household) => (
          <QualityRow
            key={household.id}
            household={household}
            openable={openable}
            onOpen={onOpen}
            showIssues={showIssues}
          />
        ))}
      </div>
    </section>
  );
}

function QualityRow({
  household,
  openable,
  onOpen,
  showIssues = false,
}: {
  household: QualityHousehold;
  openable: (id: string) => boolean;
  onOpen: (id: string) => void;
  showIssues?: boolean;
}): JSX.Element {
  const { t } = useApp();
  const address = [household.houseNumber, household.locality].filter(Boolean).join(', ') || '—';

  return (
    <div className="card stack-sm" style={{ boxShadow: 'none' }}>
      <div className="row-between">
        <span className="title mono">{household.householdNumber}</span>
        <span className={`badge badge-${household.status}`}>{t(`status.${household.status}`)}</span>
      </div>
      <div className="meta">{address}</div>
      <div className="meta tiny">
        {household.enumeratorName || t('common.unknown')} · {household.members}{' '}
        · {relativeTime(household.updatedAt)}
      </div>

      {showIssues && household.issues?.length ? (
        <div className="row-wrap">
          {household.issues.map((code) => (
            <span className="badge badge-flagged" key={code}>
              {t(`validation.${code}`)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="row-wrap">
        {household.location ? (
          <a
            className="btn btn-outline btn-sm"
            href={googleMapsUrl(household.location)}
            target="_blank"
            rel="noreferrer"
          >
            <LocationIcon />
            {t('maps.view')}
          </a>
        ) : null}
        {openable(household.id) ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onOpen(household.id)}
          >
            {t('common.view')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
