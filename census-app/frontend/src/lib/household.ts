/** Household factory helpers and local export/import. */

import { googleMapsUrl } from './maps';
import type { Household, LanguageCode, Member } from './types';
import { nowIso, shortCode, uuid } from './utils';

export function blankMember(overrides: Partial<Member> = {}): Member {
  return {
    id: uuid(),
    name: '',
    relationToHead: '',
    gender: '',
    age: null,
    maritalStatus: '',
    ageAtMarriage: null,
    religion: '',
    casteCategory: '',
    motherTongue: '',
    otherLanguages: '',
    literate: null,
    education: '',
    attendingEducation: null,
    economicActivity: '',
    occupation: '',
    industry: '',
    disability: '',
    birthPlace: '',
    lastResidence: '',
    migrationReason: '',
    mobile: '',
    ...overrides,
  };
}

export function blankHousehold(options: {
  zoneId: string;
  zoneCode?: string;
  enumeratorId: string;
  enumeratorName: string;
  collectedBy: 'enumerator' | 'citizen';
  language: LanguageCode;
  state?: string;
  district?: string;
}): Household {
  const timestamp = nowIso();
  return {
    id: uuid(),
    // Random suffix rather than a counter: enumerators work offline on many
    // devices at once, so a sequence would collide on sync.
    householdNumber: `${options.zoneCode || 'HH'}-${shortCode(6)}`,
    status: 'draft',
    sync: 'local',
    zoneId: options.zoneId,
    collectedBy: options.collectedBy,
    enumeratorId: options.enumeratorId,
    enumeratorName: options.enumeratorName,
    location: null,
    address: {
      houseNumber: '',
      buildingName: '',
      street: '',
      locality: '',
      village: '',
      tehsil: '',
      district: options.district ?? '',
      state: options.state ?? '',
      pincode: '',
    },
    housing: {
      buildingType: '',
      ownership: '',
      rooms: null,
      marriedCouples: null,
      hasSeparateKitchen: null,
      hasBathroom: null,
      waterSource: '',
      waterWithinPremises: null,
      toilet: '',
      drainage: '',
      lighting: '',
      cookingFuel: '',
      assets: [],
    },
    members: [],
    photos: [],
    notes: '',
    language: options.language,
    flags: [],
    reviews: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    rev: 0,
  };
}

/**
 * Should this save be pushed to the server?
 *
 * Drafts stay on the device until they are submitted, but once a household has
 * been submitted every later edit has to reach the server — otherwise a
 * correction to a flagged household would sit on the phone for ever while the
 * UI showed it as synced.
 */
export function shouldQueueForSync(
  household: Pick<Household, 'status'>,
  options: { deviceOnly: boolean; explicit?: boolean },
): boolean {
  if (options.deviceOnly) return false;
  // An explicit choice wins in both directions: `false` is how a caller stores
  // a copy that came *from* the server without pushing it straight back.
  if (options.explicit !== undefined) return options.explicit;
  return household.status !== 'draft';
}

/* ------------------------------------------------------------------ */
/* CSV export (works entirely offline)                                 */
/* ------------------------------------------------------------------ */

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  // BOM so Excel opens Indic text correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export const HOUSEHOLD_COLUMNS = [
  'household_number',
  'acknowledgement_id',
  'status',
  'zone_id',
  'collected_by',
  'enumerator_name',
  'latitude',
  'longitude',
  'gps_accuracy_m',
  'google_maps_url',
  'house_number',
  'building_name',
  'street',
  'locality',
  'village',
  'tehsil',
  'district',
  'state',
  'pincode',
  'building_type',
  'ownership',
  'rooms',
  'married_couples',
  'separate_kitchen',
  'bathroom',
  'water_source',
  'water_within_premises',
  'toilet',
  'drainage',
  'lighting',
  'cooking_fuel',
  'assets',
  'members',
  'errors',
  'warnings',
  'created_at',
  'updated_at',
  'submitted_at',
];

export function householdRow(household: Household): Record<string, unknown> {
  const errors = household.flags.filter((flag) => flag.severity === 'error').length;
  const warnings = household.flags.filter((flag) => flag.severity === 'warning').length;
  return {
    household_number: household.householdNumber,
    acknowledgement_id: household.acknowledgementId ?? '',
    status: household.status,
    zone_id: household.zoneId,
    collected_by: household.collectedBy,
    enumerator_name: household.enumeratorName,
    latitude: household.location?.lat ?? '',
    longitude: household.location?.lng ?? '',
    gps_accuracy_m:
      household.location?.accuracy === undefined ? '' : Math.round(household.location.accuracy),
    // Clickable straight from the spreadsheet, so whoever verifies the data can
    // jump to the doorstep instead of copying coordinates around.
    google_maps_url: household.location ? googleMapsUrl(household.location) : '',
    house_number: household.address.houseNumber,
    building_name: household.address.buildingName,
    street: household.address.street,
    locality: household.address.locality,
    village: household.address.village,
    tehsil: household.address.tehsil,
    district: household.address.district,
    state: household.address.state,
    pincode: household.address.pincode,
    building_type: household.housing.buildingType,
    ownership: household.housing.ownership,
    rooms: household.housing.rooms ?? '',
    married_couples: household.housing.marriedCouples ?? '',
    separate_kitchen: boolText(household.housing.hasSeparateKitchen),
    bathroom: boolText(household.housing.hasBathroom),
    water_source: household.housing.waterSource,
    water_within_premises: boolText(household.housing.waterWithinPremises),
    toilet: household.housing.toilet,
    drainage: household.housing.drainage,
    lighting: household.housing.lighting,
    cooking_fuel: household.housing.cookingFuel,
    assets: household.housing.assets.join('|'),
    members: household.members.length,
    errors,
    warnings,
    created_at: household.createdAt,
    updated_at: household.updatedAt,
    submitted_at: household.submittedAt ?? '',
  };
}

export const MEMBER_COLUMNS = [
  'household_number',
  'zone_id',
  'district',
  'state',
  'member_index',
  'name',
  'relation_to_head',
  'gender',
  'age',
  'marital_status',
  'age_at_marriage',
  'religion',
  'caste_category',
  'mother_tongue',
  'other_languages',
  'literate',
  'education',
  'attending_education',
  'economic_activity',
  'occupation',
  'industry',
  'disability',
  'birth_place',
  'last_residence',
  'migration_reason',
  'mobile',
];

export function memberRows(household: Household): Array<Record<string, unknown>> {
  return household.members.map((member, index) => ({
    household_number: household.householdNumber,
    zone_id: household.zoneId,
    district: household.address.district,
    state: household.address.state,
    member_index: index + 1,
    name: member.name,
    relation_to_head: member.relationToHead,
    gender: member.gender,
    age: member.age ?? '',
    marital_status: member.maritalStatus,
    age_at_marriage: member.ageAtMarriage ?? '',
    religion: member.religion,
    caste_category: member.casteCategory,
    mother_tongue: member.motherTongue,
    other_languages: member.otherLanguages,
    literate: boolText(member.literate),
    education: member.education,
    attending_education: boolText(member.attendingEducation),
    economic_activity: member.economicActivity,
    occupation: member.occupation,
    industry: member.industry,
    disability: member.disability,
    birth_place: member.birthPlace,
    last_residence: member.lastResidence,
    migration_reason: member.migrationReason,
    mobile: member.mobile,
  }));
}

function boolText(value: boolean | null): string {
  if (value === null || value === undefined) return '';
  return value ? 'yes' : 'no';
}

export function householdsToCsv(households: Household[]): string {
  return toCsv(households.map(householdRow), HOUSEHOLD_COLUMNS);
}

export function membersToCsv(households: Household[]): string {
  return toCsv(households.flatMap(memberRows), MEMBER_COLUMNS);
}

export interface BackupFile {
  format: 'india-census-2026';
  version: number;
  exportedAt: string;
  households: Household[];
}

export function makeBackup(households: Household[]): BackupFile {
  return {
    format: 'india-census-2026',
    version: 1,
    exportedAt: nowIso(),
    households,
  };
}

/** Parse and sanity-check a backup file before it is written to the device. */
export function parseBackup(text: string): Household[] {
  const parsed: unknown = JSON.parse(text);

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as BackupFile).households)
      ? (parsed as BackupFile).households
      : null;

  if (!list) throw new Error('Not a census backup file');

  const households: Household[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Partial<Household>;
    if (typeof candidate.id !== 'string' || !Array.isArray(candidate.members)) continue;
    households.push({
      ...(candidate as Household),
      // Restored records are local until they sync again.
      sync: 'local',
    });
  }

  if (!households.length) throw new Error('Backup contained no households');
  return households;
}
