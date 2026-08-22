import { describe, expect, it } from 'vitest';

import { blankHousehold } from '../lib/household';
import {
  MAX_ROUTE_STOPS,
  geoUri,
  googleDirectionsUrl,
  googleMapsUrl,
  googleRouteUrl,
  googleStreetViewUrl,
  mapLinksFor,
  mapLinksToCsv,
  openStreetMapUrl,
  routeLegs,
} from '../lib/maps';
import type { GeoPoint, Household } from '../lib/types';

const KOLKATA: GeoPoint = { lat: 22.5726, lng: 88.3639, accuracy: 9 };

function household(overrides: Partial<Household> = {}): Household {
  const base = blankHousehold({
    zoneId: 'zone-1',
    zoneCode: 'WB01',
    enumeratorId: 'e1',
    enumeratorName: 'Ravi',
    collectedBy: 'enumerator',
    language: 'en',
  });
  base.address.houseNumber = '12A';
  base.address.village = 'Salt Lake';
  return { ...base, ...overrides };
}

describe('map links', () => {
  it('builds a Google Maps pin', () => {
    expect(googleMapsUrl(KOLKATA)).toBe(
      'https://www.google.com/maps/search/?api=1&query=22.572600,88.363900',
    );
  });

  it('builds driving directions', () => {
    const url = googleDirectionsUrl(KOLKATA);
    expect(url).toContain('destination=22.572600,88.363900');
    expect(url).toContain('travelmode=driving');
  });

  it('builds a Street View link', () => {
    expect(googleStreetViewUrl(KOLKATA)).toContain('map_action=pano');
  });

  it('builds a geo: URI that a phone can open in any map app', () => {
    expect(geoUri(KOLKATA)).toBe('geo:22.572600,88.363900?q=22.572600,88.363900');
    expect(geoUri(KOLKATA, 'House 12A')).toContain('House%2012A');
  });

  it('offers OpenStreetMap for anyone avoiding Google', () => {
    const url = openStreetMapUrl(KOLKATA);
    expect(url).toContain('mlat=22.572600');
    expect(url).toContain('openstreetmap.org');
  });

  it('rounds to a precision finer than GPS can measure', () => {
    // Six decimals is ~0.1 m; anything more is noise in the URL.
    expect(googleMapsUrl({ lat: 22.5726001234, lng: 88.3639005678 })).toContain('22.572600,88.363901');
  });
});

describe('routes', () => {
  const points = (count: number): GeoPoint[] =>
    Array.from({ length: count }, (_, index) => ({
      lat: 22.57 + index * 0.001,
      lng: 88.36 + index * 0.001,
    }));

  it('needs at least two stops', () => {
    expect(googleRouteUrl([])).toBeNull();
    expect(googleRouteUrl(points(1))).toBeNull();
  });

  it('puts the middle stops in as waypoints', () => {
    const url = googleRouteUrl(points(4));
    expect(url).toContain('origin=22.570000,88.360000');
    expect(url).toContain('destination=22.573000,88.363000');
    // Two intermediate stops, separated by the pipe Google expects.
    expect(decodeURIComponent(url ?? '')).toContain('waypoints=22.571000,88.361000|22.572000,88.362000');
  });

  it('splits a long round into legs Google will accept', () => {
    // Google caps a directions URL at ten stops, so 25 households cannot be
    // one link — the round is handed over as consecutive legs instead.
    const legs = routeLegs(points(25));
    expect(legs.length).toBeGreaterThan(1);
    for (const leg of legs) {
      const waypoints = decodeURIComponent(leg).match(/waypoints=([^&]*)/)?.[1] ?? '';
      const stops = 2 + (waypoints ? waypoints.split('|').length : 0);
      expect(stops).toBeLessThanOrEqual(MAX_ROUTE_STOPS);
    }
  });

  it('covers every household across the legs', () => {
    const all = points(12);
    const legs = routeLegs(all);
    const seen = new Set<string>();
    for (const leg of legs) {
      for (const match of decodeURIComponent(leg).matchAll(/(\d+\.\d{6},\d+\.\d{6})/g)) {
        seen.add(match[1]);
      }
    }
    expect(seen.size).toBe(all.length);
  });
});

describe('household map links', () => {
  it('skips households with no GPS', () => {
    const withGps = household({ location: KOLKATA });
    const without = household({ location: null });
    const links = mapLinksFor([withGps, without]);
    expect(links).toHaveLength(1);
    expect(links[0].householdNumber).toBe(withGps.householdNumber);
  });

  it('labels a link with the address, falling back to the number', () => {
    const named = household({ location: KOLKATA });
    expect(mapLinksFor([named])[0].label).toBe('12A, Salt Lake');

    const bare = household({ location: KOLKATA });
    bare.address.houseNumber = '';
    bare.address.village = '';
    expect(mapLinksFor([bare])[0].label).toBe(bare.householdNumber);
  });

  it('exports a CSV with a clickable link per household', () => {
    const csv = mapLinksToCsv(mapLinksFor([household({ location: KOLKATA })]));
    expect(csv.startsWith('﻿')).toBe(true);   // BOM, so Excel reads Indic text
    expect(csv).toContain('google_maps_url');
    expect(csv).toContain('https://www.google.com/maps/search/?api=1&query=22.572600,88.363900');
  });

  it('escapes an address containing a comma', () => {
    const tricky = household({ location: KOLKATA });
    tricky.address.village = 'Salt Lake, Sector V';
    expect(mapLinksToCsv(mapLinksFor([tricky]))).toContain('"12A, Salt Lake, Sector V"');
  });
});
