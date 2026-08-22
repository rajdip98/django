/** Google Maps links for every geo-tagged household.
 *
 * Works entirely from the device's own copy of the data, so a supervisor can
 * plan a verification round on the way to the field with no connection.
 */

import { useMemo, useState } from 'react';

import { DownloadIcon, LocationIcon, MapIcon } from '../../components/Icons';
import { Banner, EmptyState } from '../../components/Layout';
import {
  googleRouteUrl,
  mapLinksToCsv,
  mapLinksFor,
  openStreetMapUrl,
  routeLegs,
  type HouseholdMapLink,
} from '../../lib/maps';
import { useApp } from '../../lib/store';
import type { HouseholdStatus } from '../../lib/types';
import { downloadText, todayKey } from '../../lib/utils';

const STATUSES: Array<HouseholdStatus | 'all'> = ['all', 'draft', 'submitted', 'approved', 'flagged'];

export function MapLinksTab(): JSX.Element {
  const { t, households, zones, toast } = useApp();

  const [zoneId, setZoneId] = useState('');
  const [enumeratorId, setEnumeratorId] = useState('');
  const [status, setStatus] = useState<HouseholdStatus | 'all'>('all');

  const geoTagged = useMemo(
    () => households.filter((household) => household.location !== null),
    [households],
  );

  const enumerators = useMemo(() => {
    const seen = new Map<string, string>();
    for (const household of geoTagged) {
      if (household.enumeratorId && !seen.has(household.enumeratorId)) {
        seen.set(household.enumeratorId, household.enumeratorName || household.enumeratorId);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [geoTagged]);

  const links = useMemo(() => {
    const filtered = geoTagged.filter((household) => {
      if (zoneId && household.zoneId !== zoneId) return false;
      if (enumeratorId && household.enumeratorId !== enumeratorId) return false;
      if (status !== 'all' && household.status !== status) return false;
      return true;
    });
    return mapLinksFor(filtered);
  }, [enumeratorId, geoTagged, status, zoneId]);

  const route = useMemo(() => {
    const points = links.map((link) => link.point);
    return { single: googleRouteUrl(points), legs: routeLegs(points) };
  }, [links]);

  const copy = async (text: string, count: number) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('maps.linksCopied', { count }), 'success');
    } catch {
      // Clipboard is blocked without a user gesture in some WebViews; the link
      // is on screen either way.
      toast(t('common.error'), 'error');
    }
  };

  if (!geoTagged.length) {
    return (
      <div className="card">
        <EmptyState icon="🗺️" title={t('maps.none')} hint={t('maps.noneHint')} />
      </div>
    );
  }

  return (
    <div className="stack">
      <Banner kind="info" icon="🗺️">
        {t('maps.hint')}
      </Banner>

      <section className="card stack-sm">
        <span className="section-label">{t('common.search')}</span>
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="map-zone">
              {t('form.zone')}
            </label>
            <select id="map-zone" value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
              <option value="">{t('common.all')}</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="map-enumerator">
              {t('maps.filterEnumerator')}
            </label>
            <select
              id="map-enumerator"
              value={enumeratorId}
              onChange={(event) => setEnumeratorId(event.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {enumerators.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="tabs" role="tablist">
          {STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              className={`tab${status === value ? ' active' : ''}`}
              onClick={() => setStatus(value)}
            >
              {value === 'all' ? t('common.all') : t(`status.${value}`)}
            </button>
          ))}
        </div>

        <p className="tiny">{t('maps.showing', { count: links.length, total: geoTagged.length })}</p>
      </section>

      {links.length ? (
        <>
          <section className="card stack-sm">
            <span className="section-label">{t('common.download')}</span>
            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={() =>
                downloadText(
                  `census-map-links-${todayKey()}.csv`,
                  mapLinksToCsv(links),
                  'text/csv',
                )
              }
            >
              <DownloadIcon />
              {t('maps.downloadCsv')}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={() => void copy(links.map((link) => link.view).join('\n'), links.length)}
            >
              {t('maps.copyAll')}
            </button>

            {route.single ? (
              <>
                <a
                  className="btn btn-accent btn-block"
                  href={route.single}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapIcon />
                  {t('maps.route')}
                </a>
                {/* Google accepts at most ten stops in one directions URL, so a
                    longer round is offered as separate legs. */}
                {route.legs.length > 1 ? (
                  <div className="row-wrap">
                    {route.legs.map((leg, index) => (
                      <a
                        key={leg}
                        className="btn btn-outline btn-sm"
                        href={leg}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('maps.routeLeg', { index: index + 1 })}
                      </a>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          <div className="list">
            {links.map((link) => (
              <MapLinkCard key={link.id} link={link} onCopy={(url) => void copy(url, 1)} />
            ))}
          </div>
        </>
      ) : (
        <div className="card">
          <EmptyState icon="🔍" title={t('households.noMatches')} />
        </div>
      )}
    </div>
  );
}

function MapLinkCard({
  link,
  onCopy,
}: {
  link: HouseholdMapLink;
  onCopy: (url: string) => void;
}): JSX.Element {
  const { t } = useApp();

  return (
    <div className="card stack-sm">
      <div className="row-between">
        <span className="title mono">{link.householdNumber}</span>
        <span className={`badge badge-${link.status}`}>{t(`status.${link.status}`)}</span>
      </div>
      <div className="meta">{link.label}</div>
      <div className="meta mono tiny">
        {link.point.lat.toFixed(5)}, {link.point.lng.toFixed(5)}
      </div>

      <div className="row-wrap">
        <a className="btn btn-primary btn-sm" href={link.view} target="_blank" rel="noreferrer">
          <LocationIcon />
          {t('maps.view')}
        </a>
        <a className="btn btn-outline btn-sm" href={link.directions} target="_blank" rel="noreferrer">
          {t('maps.directions')}
        </a>
        <a className="btn btn-outline btn-sm" href={link.streetView} target="_blank" rel="noreferrer">
          {t('maps.streetView')}
        </a>
        <a
          className="btn btn-ghost btn-sm"
          href={openStreetMapUrl(link.point)}
          target="_blank"
          rel="noreferrer"
        >
          {t('maps.openStreetMap')}
        </a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCopy(link.view)}>
          {t('maps.copy')}
        </button>
      </div>
    </div>
  );
}
