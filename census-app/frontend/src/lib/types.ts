/** Domain model for the India Census 2026-27 application. */

export type Role = 'enumerator' | 'citizen' | 'supervisor' | 'admin';

export type LanguageCode = 'en' | 'hi' | 'bn' | 'ta' | 'te' | 'mr' | 'gu';

export interface User {
  id: string;
  name: string;
  mobile: string;
  role: Role;
  zoneIds: string[];
  employeeCode?: string;
  supervisorId?: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Session {
  token: string;
  user: User;
  /** `true` when the session was created without a backend (device-only mode). */
  local: boolean;
  issuedAt: string;
}

export interface Zone {
  id: string;
  code: string;
  name: string;
  district: string;
  state: string;
  /** Target number of households to enumerate in this zone. */
  targetHouseholds: number;
  /** Optional centre used to focus the map. */
  center?: GeoPoint;
  assignedTo: string[];
}

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt?: string;
}

export type HouseholdStatus = 'draft' | 'submitted' | 'approved' | 'flagged';

export type SyncState = 'local' | 'pending' | 'synced' | 'error';

export interface Address {
  houseNumber: string;
  buildingName: string;
  street: string;
  locality: string;
  village: string;
  tehsil: string;
  district: string;
  state: string;
  pincode: string;
}

export type BuildingType = 'pucca' | 'semi_pucca' | 'kutcha' | 'other';
export type Ownership = 'owned' | 'rented' | 'other';
export type WaterSource =
  | 'tap_treated'
  | 'tap_untreated'
  | 'covered_well'
  | 'uncovered_well'
  | 'handpump'
  | 'tubewell'
  | 'spring'
  | 'river_canal'
  | 'tank_pond'
  | 'other';
export type ToiletType =
  | 'flush_piped_sewer'
  | 'flush_septic'
  | 'pit_latrine'
  | 'other_latrine'
  | 'public_latrine'
  | 'open';
export type CookingFuel =
  | 'lpg_png'
  | 'electricity'
  | 'firewood'
  | 'crop_residue'
  | 'cow_dung'
  | 'coal_charcoal'
  | 'kerosene'
  | 'biogas'
  | 'other';
export type LightingSource = 'electricity' | 'kerosene' | 'solar' | 'other_oil' | 'none';

export interface Housing {
  buildingType: BuildingType | '';
  ownership: Ownership | '';
  rooms: number | null;
  marriedCouples: number | null;
  hasSeparateKitchen: boolean | null;
  hasBathroom: boolean | null;
  waterSource: WaterSource | '';
  waterWithinPremises: boolean | null;
  toilet: ToiletType | '';
  drainage: 'closed' | 'open' | 'none' | '';
  lighting: LightingSource | '';
  cookingFuel: CookingFuel | '';
  /** Asset ownership — keys from ASSET_OPTIONS. */
  assets: string[];
}

export type Gender = 'male' | 'female' | 'transgender';
export type MaritalStatus = 'never_married' | 'married' | 'widowed' | 'separated' | 'divorced';
export type CasteCategory = 'general' | 'sc' | 'st' | 'obc';
export type EducationLevel =
  | 'illiterate'
  | 'literate_no_schooling'
  | 'below_primary'
  | 'primary'
  | 'middle'
  | 'secondary'
  | 'higher_secondary'
  | 'diploma'
  | 'graduate'
  | 'postgraduate'
  | 'doctorate';
export type EconomicActivity =
  | 'main_worker'
  | 'marginal_worker'
  | 'seeking_work'
  | 'student'
  | 'household_duties'
  | 'dependent'
  | 'pensioner'
  | 'other_non_worker';
export type Disability =
  | 'none'
  | 'visual'
  | 'hearing'
  | 'speech'
  | 'locomotor'
  | 'intellectual'
  | 'mental_illness'
  | 'multiple'
  | 'other';
export type RelationToHead =
  | 'head'
  | 'spouse'
  | 'son'
  | 'daughter'
  | 'father'
  | 'mother'
  | 'brother'
  | 'sister'
  | 'grandson'
  | 'granddaughter'
  | 'son_in_law'
  | 'daughter_in_law'
  | 'father_in_law'
  | 'mother_in_law'
  | 'other_relative'
  | 'non_relative';

export interface Member {
  id: string;
  name: string;
  relationToHead: RelationToHead | '';
  gender: Gender | '';
  age: number | null;
  maritalStatus: MaritalStatus | '';
  ageAtMarriage: number | null;
  religion: string;
  casteCategory: CasteCategory | '';
  motherTongue: string;
  otherLanguages: string;
  literate: boolean | null;
  education: EducationLevel | '';
  attendingEducation: boolean | null;
  economicActivity: EconomicActivity | '';
  occupation: string;
  industry: string;
  disability: Disability | '';
  birthPlace: string;
  lastResidence: string;
  migrationReason: string;
  mobile: string;
}

export interface Photo {
  id: string;
  /** Down-scaled JPEG data URL — kept small enough to sync over rural networks. */
  dataUrl: string;
  caption: string;
  capturedAt: string;
}

export type FlagSeverity = 'error' | 'warning' | 'info';

export interface ValidationFlag {
  code: string;
  severity: FlagSeverity;
  /** i18n key describing the problem. */
  messageKey: string;
  /** Interpolation values for the message. */
  values?: Record<string, string | number>;
  /** Member id when the flag belongs to a specific person. */
  memberId?: string;
  field?: string;
}

export interface ReviewNote {
  id: string;
  by: string;
  byName: string;
  at: string;
  action: 'approved' | 'flagged' | 'comment' | 'reopened';
  text: string;
}

export interface Household {
  id: string;
  /** Human-readable census number, e.g. `WB-24-0007-0123`. */
  householdNumber: string;
  /** Receipt issued to a citizen on self-enumeration. */
  acknowledgementId?: string;
  status: HouseholdStatus;
  sync: SyncState;
  syncError?: string;
  zoneId: string;
  collectedBy: 'enumerator' | 'citizen';
  enumeratorId: string;
  enumeratorName: string;
  location: GeoPoint | null;
  address: Address;
  housing: Housing;
  members: Member[];
  photos: Photo[];
  notes: string;
  language: LanguageCode;
  flags: ValidationFlag[];
  reviews: ReviewNote[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  /** Server revision used for conflict detection during sync. */
  rev: number;
}

export type NoticeAudience = 'all' | 'enumerator' | 'supervisor';
export type NoticeLevel = 'info' | 'important' | 'urgent';

/** An announcement from the administrator to the people in the field. */
export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  level: NoticeLevel;
  active: boolean;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  updatedAt?: string | null;
}

/** One household as it appears in a data-quality listing. */
export interface QualityHousehold {
  id: string;
  householdNumber: string;
  status: HouseholdStatus;
  zoneId: string;
  enumeratorId: string;
  enumeratorName: string;
  houseNumber: string;
  locality: string;
  district: string;
  members: number;
  location: GeoPoint | null;
  updatedAt: string;
  /** Server-side check codes, present only in the `withIssues` list. */
  issues?: string[];
}

export interface DuplicateCluster {
  reason: 'location' | 'address';
  distanceMeters: number | null;
  households: QualityHousehold[];
}

export interface QualityReport {
  generatedAt: string | null;
  radiusMeters: number;
  counts: {
    reviewed: number;
    missingLocation: number;
    unassigned: number;
    withIssues: number;
    duplicateClusters: number;
    duplicateHouseholds: number;
  };
  missingLocation: QualityHousehold[];
  unassigned: QualityHousehold[];
  withIssues: QualityHousehold[];
  duplicates: DuplicateCluster[];
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string;
  detail: string;
}

export interface OutboxItem {
  id: string;
  householdId: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface AnalyticsSummary {
  households: number;
  members: number;
  submitted: number;
  approved: number;
  flagged: number;
  drafts: number;
  targetHouseholds: number;
  coverage: number;
  averageHouseholdSize: number;
  genderCounts: Record<string, number>;
  ageBands: Record<string, number>;
  literacy: { literate: number; illiterate: number };
  casteCounts: Record<string, number>;
  religionCounts: Record<string, number>;
  zoneProgress: Array<{
    zoneId: string;
    zoneName: string;
    collected: number;
    target: number;
    coverage: number;
  }>;
  enumeratorProgress: Array<{
    enumeratorId: string;
    name: string;
    collected: number;
    submitted: number;
    approved: number;
    flagged: number;
    lastActivity?: string;
  }>;
  dailyCounts: Array<{ date: string; count: number }>;
}
