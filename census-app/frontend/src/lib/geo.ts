/** Geolocation helpers for household geo-tagging. */

import type { GeoPoint } from './types';
import { nowIso } from './utils';

export type GeoErrorCode =
  | 'unsupported'
  | 'insecure'
  | 'denied'
  | 'unavailable'
  | 'timeout';

export class GeoError extends Error {
  readonly code: GeoErrorCode;

  constructor(code: GeoErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'GeoError';
    this.code = code;
  }
}

/** i18n key describing a geolocation failure. */
export function geoErrorKey(code: GeoErrorCode): string {
  switch (code) {
    case 'unsupported':
      return 'form.gps.unsupported';
    case 'insecure':
      return 'form.gps.insecure';
    case 'denied':
      return 'form.gps.denied';
    default:
      return 'form.gps.unavailable';
  }
}

function isSecureEnough(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  // Browsers treat localhost as secure even without HTTPS.
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/**
 * Capture the current position.
 *
 * Field GPS is slow to settle, so we take readings for up to `settleMs` and keep
 * the most accurate one rather than trusting the first fix (which is often a
 * 1–2 km network estimate).
 */
export function capturePosition(
  options: { timeoutMs?: number; settleMs?: number; desiredAccuracy?: number } = {},
): Promise<GeoPoint> {
  const { timeoutMs = 20000, settleMs = 6000, desiredAccuracy = 20 } = options;

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeoError('unsupported'));
      return;
    }
    if (!isSecureEnough()) {
      reject(new GeoError('insecure'));
      return;
    }

    let best: GeoPoint | null = null;
    let settled = false;
    let watchId: number | null = null;
    let settleTimer: number | undefined;
    let hardTimer: number | undefined;

    const finish = (error?: GeoError) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      if (hardTimer !== undefined) window.clearTimeout(hardTimer);
      if (best) resolve(best);
      else reject(error ?? new GeoError('unavailable'));
    };

    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const point: GeoPoint = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: nowIso(),
          };
          if (!best || (point.accuracy ?? Infinity) < (best.accuracy ?? Infinity)) best = point;
          // Good enough — stop early rather than draining the battery.
          if ((point.accuracy ?? Infinity) <= desiredAccuracy) finish();
        },
        (error) => {
          if (best) {
            finish();
            return;
          }
          if (error.code === error.PERMISSION_DENIED) finish(new GeoError('denied', error.message));
          else if (error.code === error.TIMEOUT) finish(new GeoError('timeout', error.message));
          else finish(new GeoError('unavailable', error.message));
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      );
    } catch (error) {
      finish(new GeoError('unavailable', error instanceof Error ? error.message : undefined));
      return;
    }

    // Accept the best reading collected so far once the settle window closes.
    settleTimer = window.setTimeout(() => {
      if (best) finish();
    }, settleMs);

    hardTimer = window.setTimeout(() => finish(new GeoError('timeout')), timeoutMs + 1000);
  });
}

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in metres. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatCoordinate(value: number, digits = 5): string {
  return value.toFixed(digits);
}

/** Bounding box for a set of points, padded slightly so markers are not on the edge. */
export function boundsOf(points: GeoPoint[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }

  const pad = Math.max(0.0015, (maxLat - minLat) * 0.15, (maxLng - minLng) * 0.15);
  return [
    [minLat - pad, minLng - pad],
    [maxLat + pad, maxLng + pad],
  ];
}

/** Geographic centre of India — a sensible default map view. */
export const INDIA_CENTER: GeoPoint = { lat: 22.9734, lng: 78.6569 };
