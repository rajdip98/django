/** Geo-tagged household map.
 *
 * Uses Leaflet with OpenStreetMap tiles: no API key, no billing account and no
 * per-load quota, which matters for a national field deployment. Swapping in
 * Google Maps or MapmyIndia is a one-line change to TILE_URL plus that
 * provider's key — see docs/DEPLOYMENT.md.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';

import { LocationIcon } from '../components/Icons';
import { AppShell, Banner, EmptyState } from '../components/Layout';
import { boundsOf, capturePosition, GeoError, geoErrorKey, INDIA_CENTER } from '../lib/geo';
import { useApp } from '../lib/store';
import type { Household, HouseholdStatus } from '../lib/types';
import { relativeTime } from '../lib/utils';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '© OpenStreetMap contributors';

const STATUS_COLORS: Record<HouseholdStatus, string> = {
  draft: '#6b7483',
  submitted: '#14508c',
  approved: '#138808',
  flagged: '#c62828',
};

function markerIcon(status: HouseholdStatus): L.DivIcon {
  // A div icon avoids Leaflet's default PNG marker, whose bundler-relative
  // image paths break in a subfolder deployment.
  return L.divIcon({
    className: '',
    html: `<span class="map-marker-pin" style="background:${STATUS_COLORS[status]}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -16],
  });
}

export function MapScreen(): JSX.Element {
  const { t, households, toast } = useApp();
  const navigate = useNavigate();

  const [view, setView] = useState<'map' | 'list'>('map');
  const [tilesFailed, setTilesFailed] = useState(false);
  const [locating, setLocating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const meMarkerRef = useRef<L.Marker | null>(null);
  const navigateRef = useRef(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const mapped = useMemo(
    () => households.filter((household) => household.location !== null),
    [households],
  );

  /* Create the map once, then keep markers in sync separately. */
  useEffect(() => {
    if (view !== 'map') return undefined;
    const container = containerRef.current;
    if (!container || mapRef.current) return undefined;

    const map = L.map(container, {
      center: [INDIA_CENTER.lat, INDIA_CENTER.lng],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    });

    const tiles = L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: TILE_ATTRIBUTION,
    });
    tiles.on('tileerror', () => setTilesFailed(true));
    tiles.on('tileload', () => setTilesFailed(false));
    tiles.addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // The container is sized by CSS; Leaflet needs a nudge after layout.
    window.setTimeout(() => map.invalidateSize(), 120);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      meMarkerRef.current = null;
    };
  }, [view]);

  /* Markers */
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    for (const household of mapped) {
      const point = household.location;
      if (!point) continue;

      const marker = L.marker([point.lat, point.lng], {
        icon: markerIcon(household.status),
        title: household.householdNumber,
      });

      const address =
        [household.address.houseNumber, household.address.village || household.address.locality]
          .filter(Boolean)
          .join(', ') || '—';

      const popup = document.createElement('div');
      popup.innerHTML = `<strong>${escapeHtml(household.householdNumber)}</strong><br>${escapeHtml(
        address,
      )}<br><span style="color:#4a5262">${household.members.length} · ${escapeHtml(
        t(`status.${household.status}`),
      )}</span><br>`;

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = t('map.openHousehold');
      button.style.cssText =
        'margin-top:6px;padding:6px 10px;border-radius:8px;border:1px solid #b9c1ce;background:#fff;font:inherit;font-weight:600;cursor:pointer';
      button.addEventListener('click', () => navigateRef.current(`/households/${household.id}`));
      popup.appendChild(button);

      marker.bindPopup(popup);
      marker.addTo(layer);
    }

    const bounds = boundsOf(mapped.map((household) => household.location!));
    if (bounds) map.fitBounds(bounds, { maxZoom: 17, padding: [24, 24] });
  }, [mapped, t]);

  const showMe = async () => {
    setLocating(true);
    try {
      const point = await capturePosition({ settleMs: 3000 });
      const map = mapRef.current;
      if (map) {
        if (meMarkerRef.current) meMarkerRef.current.remove();
        meMarkerRef.current = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: '',
            html: '<span class="map-marker-pin" style="background:#000080"></span>',
            iconSize: [18, 18],
            iconAnchor: [9, 18],
          }),
          title: t('map.myLocation'),
        }).addTo(map);
        map.setView([point.lat, point.lng], 16);
      }
    } catch (error) {
      const key = error instanceof GeoError ? geoErrorKey(error.code) : 'form.gps.unavailable';
      toast(t(key), 'error');
    } finally {
      setLocating(false);
    }
  };

  return (
    <AppShell
      title={t('map.title')}
      subtitle={t('map.households', { count: mapped.length })}
      actions={
        <div className="tabs" style={{ flex: 'none' }}>
          <button
            type="button"
            className={`tab${view === 'map' ? ' active' : ''}`}
            onClick={() => setView('map')}
          >
            {t('map.mapView')}
          </button>
          <button
            type="button"
            className={`tab${view === 'list' ? ' active' : ''}`}
            onClick={() => setView('list')}
          >
            {t('map.listView')}
          </button>
        </div>
      }
      showSync={false}
    >
      <div className="stack">
        {!mapped.length ? (
          <div className="card">
            <EmptyState icon="🗺️" title={t('map.empty')} hint={t('map.emptyHint')} />
          </div>
        ) : view === 'map' ? (
          <>
            {tilesFailed ? (
              <Banner kind="warning" icon="📴">
                {t('map.offline')}
              </Banner>
            ) : null}
            <div className="map-container" ref={containerRef} />
            <div className="row" style={{ gap: 10 }}>
              <button
                type="button"
                className="btn btn-outline grow"
                onClick={() => void showMe()}
                disabled={locating}
              >
                <LocationIcon />
                {locating ? t('form.gps.capturing') : t('map.myLocation')}
              </button>
              <button
                type="button"
                className="btn btn-outline grow"
                onClick={() => {
                  const bounds = boundsOf(mapped.map((household) => household.location!));
                  if (bounds) mapRef.current?.fitBounds(bounds, { maxZoom: 17, padding: [24, 24] });
                }}
              >
                {t('map.recenter')}
              </button>
            </div>
            <Legend />
          </>
        ) : (
          <div className="list">
            {mapped.map((household) => (
              <MappedRow key={household.id} household={household} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Legend(): JSX.Element {
  const { t } = useApp();
  const statuses: HouseholdStatus[] = ['draft', 'submitted', 'approved', 'flagged'];

  return (
    <div className="card">
      <span className="section-label">{t('map.legend')}</span>
      <div className="row-wrap" style={{ marginTop: 6 }}>
        {statuses.map((status) => (
          <span className="row" key={status} style={{ gap: 6 }}>
            <span className="dot" style={{ background: STATUS_COLORS[status] }} />
            <span className="tiny">{t(`status.${status}`)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MappedRow({ household }: { household: Household }): JSX.Element {
  const { t } = useApp();
  const navigate = useNavigate();
  const point = household.location;

  return (
    <button
      type="button"
      className="list-item"
      onClick={() => navigate(`/households/${household.id}`)}
    >
      <div className="row-between">
        <span className="title mono">{household.householdNumber}</span>
        <span className={`badge badge-${household.status}`}>{t(`status.${household.status}`)}</span>
      </div>
      <div className="meta mono">
        {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : '—'}
      </div>
      <div className="meta">{relativeTime(household.updatedAt)}</div>
    </button>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
