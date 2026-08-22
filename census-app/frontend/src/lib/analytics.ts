/** Local analytics.
 *
 * Computed from whatever the device holds so supervisors and administrators get
 * charts even with no connectivity. When a backend is available the same shape
 * comes back from `/api/analytics/summary` over the full dataset.
 */

import type { AnalyticsSummary, Household, User, Zone } from './types';
import { percent, todayKey } from './utils';

export const AGE_BANDS: Array<{ key: string; min: number; max: number }> = [
  { key: 'band.0_6', min: 0, max: 6 },
  { key: 'band.7_14', min: 7, max: 14 },
  { key: 'band.15_29', min: 15, max: 29 },
  { key: 'band.30_44', min: 30, max: 44 },
  { key: 'band.45_59', min: 45, max: 59 },
  { key: 'band.60_plus', min: 60, max: Number.POSITIVE_INFINITY },
];

function bandFor(age: number): string {
  const band = AGE_BANDS.find((candidate) => age >= candidate.min && age <= candidate.max);
  return band ? band.key : 'band.60_plus';
}

export function computeAnalytics(
  households: Household[],
  zones: Zone[] = [],
  users: User[] = [],
): AnalyticsSummary {
  const genderCounts: Record<string, number> = { male: 0, female: 0, transgender: 0 };
  const ageBands: Record<string, number> = {};
  const casteCounts: Record<string, number> = {};
  const religionCounts: Record<string, number> = {};
  const literacy = { literate: 0, illiterate: 0 };
  const dailyMap = new Map<string, number>();

  for (const band of AGE_BANDS) ageBands[band.key] = 0;

  let members = 0;
  let submitted = 0;
  let approved = 0;
  let flagged = 0;
  let drafts = 0;

  for (const household of households) {
    if (household.status === 'submitted') submitted += 1;
    else if (household.status === 'approved') approved += 1;
    else if (household.status === 'flagged') flagged += 1;
    else drafts += 1;

    const day = todayKey(household.submittedAt ?? household.createdAt);
    if (day) dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);

    for (const member of household.members) {
      members += 1;
      if (member.gender) genderCounts[member.gender] = (genderCounts[member.gender] ?? 0) + 1;
      if (member.age !== null && member.age !== undefined && member.age >= 0) {
        const key = bandFor(member.age);
        ageBands[key] = (ageBands[key] ?? 0) + 1;
      }
      if (member.casteCategory) {
        casteCounts[member.casteCategory] = (casteCounts[member.casteCategory] ?? 0) + 1;
      }
      if (member.religion) {
        religionCounts[member.religion] = (religionCounts[member.religion] ?? 0) + 1;
      }
      if (member.literate === true) literacy.literate += 1;
      else if (member.literate === false) literacy.illiterate += 1;
    }
  }

  /* Zones ----------------------------------------------------------- */
  const zoneProgress = zones.map((zone) => {
    const collected = households.filter((household) => household.zoneId === zone.id).length;
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      collected,
      target: zone.targetHouseholds,
      coverage: percent(collected, zone.targetHouseholds),
    };
  });

  // Households in zones the device does not know about still deserve a row.
  const knownZoneIds = new Set(zones.map((zone) => zone.id));
  const orphanCount = households.filter(
    (household) => !household.zoneId || !knownZoneIds.has(household.zoneId),
  ).length;
  if (orphanCount) {
    zoneProgress.push({
      zoneId: '',
      zoneName: 'Unassigned',
      collected: orphanCount,
      target: 0,
      coverage: 0,
    });
  }

  /* Enumerators ------------------------------------------------------ */
  const byEnumerator = new Map<string, AnalyticsSummary['enumeratorProgress'][number]>();
  for (const household of households) {
    const id = household.enumeratorId || 'unknown';
    let entry = byEnumerator.get(id);
    if (!entry) {
      const user = users.find((candidate) => candidate.id === id);
      entry = {
        enumeratorId: id,
        name: household.enumeratorName || user?.name || 'Unknown',
        collected: 0,
        submitted: 0,
        approved: 0,
        flagged: 0,
      };
      byEnumerator.set(id, entry);
    }
    entry.collected += 1;
    if (household.status === 'submitted') entry.submitted += 1;
    if (household.status === 'approved') entry.approved += 1;
    if (household.status === 'flagged') entry.flagged += 1;
    if (!entry.lastActivity || entry.lastActivity < household.updatedAt) {
      entry.lastActivity = household.updatedAt;
    }
  }

  /* Daily counts — last 14 days, including zero days so the chart is honest */
  const dailyCounts: Array<{ date: string; count: number }> = [];
  const today = new Date();
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = todayKey(date);
    dailyCounts.push({ date: key, count: dailyMap.get(key) ?? 0 });
  }

  const targetHouseholds = zones.reduce((total, zone) => total + zone.targetHouseholds, 0);

  return {
    households: households.length,
    members,
    submitted,
    approved,
    flagged,
    drafts,
    targetHouseholds,
    coverage: percent(households.length, targetHouseholds),
    averageHouseholdSize: households.length
      ? Math.round((members / households.length) * 10) / 10
      : 0,
    genderCounts,
    ageBands,
    literacy,
    casteCounts,
    religionCounts,
    zoneProgress: zoneProgress.sort((a, b) => b.collected - a.collected),
    enumeratorProgress: Array.from(byEnumerator.values()).sort((a, b) => b.collected - a.collected),
    dailyCounts,
  };
}

/** Females per 1000 males, the standard census presentation. */
export function sexRatio(genderCounts: Record<string, number>): number | null {
  const males = genderCounts.male ?? 0;
  const females = genderCounts.female ?? 0;
  if (!males) return null;
  return Math.round((females / males) * 1000);
}

/** Households a supervisor should look at first. */
export function needsAttention(households: Household[]): Household[] {
  return households.filter((household) => {
    if (household.status === 'flagged') return true;
    if (household.status === 'draft') return false;
    if (household.flags.some((flag) => flag.severity === 'error')) return true;
    if (!household.location && household.collectedBy === 'enumerator') return true;
    return false;
  });
}
