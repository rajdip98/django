/** Google Maps (and native map app) links for geo-tagged households.
 *
 * Leaflet draws the in-app map, but a supervisor verifying a household, or a
 * driver trying to reach one, wants the map app they already use — with its
 * satellite imagery, its traffic, and turn-by-turn directions. These builders
 * produce links that open Google Maps on the web, and the installed maps app on
 * Android and iOS.
 */

import type { GeoPoint, Household } from './types';

/** Six decimal places is about 0.1 m — well past GPS accuracy, and keeps URLs short. */
const PRECISION = 6;

function pair(point: GeoPoint): string {
  return `${point.lat.toFixed(PRECISION)},${point.lng.toFixed(PRECISION)}`;
}

/** Drop a pin at the household. Opens the Maps app on a phone. */
export function googleMapsUrl(point: GeoPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${pair(point)}`;
}

/** Turn-by-turn directions from wherever the user is. */
export function googleDirectionsUrl(point: GeoPoint): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${pair(point)}&travelmode=driving`;
}

/** Street-level imagery — useful for confirming a house front against a photo. */
export function googleStreetViewUrl(point: GeoPoint): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${pair(point)}`;
}

/** Platform-neutral geo: URI. Android opens whichever map app is installed. */
export function geoUri(point: GeoPoint, label?: string): string {
  const query = label ? `${pair(point)}(${encodeURIComponent(label)})` : pair(point);
  return `geo:${pair(point)}?q=${query}`;
}

/** OpenStreetMap, for anyone who would rather not send coordinates to Google. */
export function openStreetMapUrl(point: GeoPoint): string {
  return `https://www.openstreetmap.org/?mlat=${point.lat.toFixed(PRECISION)}&mlon=${point.lng.toFixed(
    PRECISION,
  )}#map=19/${pair(point).replace(',', '/')}`;
}

/**
 * A route through several households, in the order given.
 *
 * Google caps a directions URL at the origin, destination and eight waypoints,
 * so longer walks are split by the caller into legs of ten.
 */
export const MAX_ROUTE_STOPS = 10;

export function googleRouteUrl(points: GeoPoint[]): string | null {
  if (points.length < 2) return null;
  const stops = points.slice(0, MAX_ROUTE_STOPS);
  const origin = pair(stops[0]);
  const destination = pair(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).map(pair).join('|');

  // Built by hand, not URLSearchParams, so the coordinates stay as Google's own
  // examples show them (literal commas and pipes) instead of percent-encoded —
  // matching every other builder in this file.
  const parts = [`api=1`, `origin=${origin}`, `destination=${destination}`, `travelmode=walking`];
  if (waypoints) parts.push(`waypoints=${waypoints}`);
  return `https://www.google.com/maps/dir/?${parts.join('&')}`;
}

/** Split a long walking list into legs Google will actually accept. */
export function routeLegs(points: GeoPoint[]): string[] {
  const legs: string[] = [];
  for (let start = 0; start < points.length - 1; start += MAX_ROUTE_STOPS - 1) {
    const slice = points.slice(start, start + MAX_ROUTE_STOPS);
    const url = googleRouteUrl(slice);
    if (url) legs.push(url);
  }
  return legs;
}

export interface HouseholdMapLink {
  id: string;
  householdNumber: string;
  label: string;
  status: Household['status'];
  point: GeoPoint;
  view: string;
  directions: string;
  streetView: string;
}

/** Everything the Map links screen and the link export need, in one shape. */
export function mapLinksFor(households: Household[]): HouseholdMapLink[] {
  const links: HouseholdMapLink[] = [];
  for (const household of households) {
    const point = household.location;
    if (!point) continue;
    const label =
      [household.address.houseNumber, household.address.village || household.address.locality]
        .filter(Boolean)
        .join(', ') || household.householdNumber;
    links.push({
      id: household.id,
      householdNumber: household.householdNumber,
      label,
      status: household.status,
      point,
      view: googleMapsUrl(point),
      directions: googleDirectionsUrl(point),
      streetView: googleStreetViewUrl(point),
    });
  }
  return links;
}

/** CSV of household number, address, coordinates and a clickable link. */
export function mapLinksToCsv(links: HouseholdMapLink[]): string {
  const escape = (value: string): string =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const rows = [
    ['household_number', 'address', 'status', 'latitude', 'longitude', 'google_maps_url', 'directions_url']
      .join(','),
  ];
  for (const link of links) {
    rows.push(
      [
        escape(link.householdNumber),
        escape(link.label),
        link.status,
        link.point.lat.toFixed(PRECISION),
        link.point.lng.toFixed(PRECISION),
        escape(link.view),
        escape(link.directions),
      ].join(','),
    );
  }
  // BOM so Excel opens the Indic address text correctly.
  return `﻿${rows.join('\r\n')}\r\n`;
}
