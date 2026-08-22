/** Census data-quality engine.
 *
 * Runs entirely on-device so an enumerator standing in a courtyard with no
 * signal still gets immediate feedback. Every rule mirrors a consistency check
 * the census schedule itself implies (age vs. education, relation vs. gender,
 * legal marriage age, and so on). Errors block submission; warnings and info
 * flags are surfaced for the enumerator or supervisor to confirm.
 *
 * When a backend with an AI provider is configured, `api.aiValidate` can add
 * further free-text observations — but the rules below are the guarantee.
 */

import { EDUCATION_MIN_AGE, RELATION_EXPECTED_GENDER } from './options';
import type { Household, Member, ValidationFlag } from './types';
import { isValidMobile, isValidPincode } from './utils';

const MAX_AGE = 120;
const IMPLAUSIBLE_AGE = 110;
const LEGAL_MARRIAGE_AGE = 18;
const MIN_WORK_AGE = 14;
const MIN_PARENT_GAP = 12;

function flag(
  code: string,
  severity: ValidationFlag['severity'],
  options: {
    memberId?: string;
    field?: string;
    values?: Record<string, string | number>;
  } = {},
): ValidationFlag {
  return {
    code,
    severity,
    messageKey: `validation.${code}`,
    memberId: options.memberId,
    field: options.field,
    values: options.values,
  };
}

function validateMember(member: Member, household: Household, head?: Member): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const id = member.id;
  const age = member.age;

  if (!member.name.trim()) {
    flags.push(flag('member_name_missing', 'error', { memberId: id, field: 'name' }));
  }

  if (!member.relationToHead) {
    flags.push(flag('member_relation_missing', 'error', { memberId: id, field: 'relationToHead' }));
  }

  if (!member.gender) {
    flags.push(flag('member_gender_missing', 'error', { memberId: id, field: 'gender' }));
  } else if (member.relationToHead) {
    const expected = RELATION_EXPECTED_GENDER[member.relationToHead];
    if (expected && member.gender !== expected && member.gender !== 'transgender') {
      flags.push(
        flag('gender_relation_mismatch', 'warning', {
          memberId: id,
          field: 'gender',
          values: { relation: member.relationToHead, gender: member.gender },
        }),
      );
    }
  }

  if (age === null || age === undefined || Number.isNaN(age)) {
    flags.push(flag('member_age_missing', 'error', { memberId: id, field: 'age' }));
    return flags; // Remaining rules all depend on a usable age.
  }

  if (age < 0 || age > MAX_AGE) {
    flags.push(
      flag('age_out_of_range', 'error', { memberId: id, field: 'age', values: { max: MAX_AGE } }),
    );
  } else if (age >= IMPLAUSIBLE_AGE) {
    flags.push(flag('age_implausible', 'warning', { memberId: id, field: 'age', values: { age } }));
  }

  /* Marriage -------------------------------------------------------- */
  const isMarried =
    member.maritalStatus === 'married' ||
    member.maritalStatus === 'widowed' ||
    member.maritalStatus === 'separated' ||
    member.maritalStatus === 'divorced';

  if (!member.maritalStatus && age >= 10) {
    flags.push(flag('marital_missing', 'warning', { memberId: id, field: 'maritalStatus' }));
  }

  if (isMarried && age < LEGAL_MARRIAGE_AGE) {
    flags.push(
      flag('married_below_legal_age', 'error', {
        memberId: id,
        field: 'maritalStatus',
        values: { age, legal: LEGAL_MARRIAGE_AGE },
      }),
    );
  }

  if (member.ageAtMarriage !== null && member.ageAtMarriage !== undefined) {
    if (member.ageAtMarriage > age) {
      flags.push(
        flag('age_at_marriage_exceeds_age', 'error', { memberId: id, field: 'ageAtMarriage' }),
      );
    } else if (member.ageAtMarriage < LEGAL_MARRIAGE_AGE) {
      flags.push(
        flag('age_at_marriage_below_legal', 'warning', {
          memberId: id,
          field: 'ageAtMarriage',
          values: { age: member.ageAtMarriage, legal: LEGAL_MARRIAGE_AGE },
        }),
      );
    }
    if (!isMarried && member.ageAtMarriage > 0) {
      flags.push(
        flag('age_at_marriage_without_marriage', 'warning', {
          memberId: id,
          field: 'ageAtMarriage',
        }),
      );
    }
  }

  /* Education ------------------------------------------------------- */
  if (member.education) {
    const minAge = EDUCATION_MIN_AGE[member.education];
    if (age < minAge) {
      flags.push(
        flag('education_exceeds_age', 'warning', {
          memberId: id,
          field: 'education',
          values: { age, level: member.education, minAge },
        }),
      );
    }
    if (member.literate === true && member.education === 'illiterate') {
      flags.push(flag('literate_but_illiterate', 'warning', { memberId: id, field: 'education' }));
    }
    if (
      member.literate === false &&
      member.education !== 'illiterate' &&
      member.education !== 'literate_no_schooling'
    ) {
      flags.push(flag('illiterate_but_educated', 'warning', { memberId: id, field: 'literate' }));
    }
  } else if (age >= 5) {
    flags.push(flag('education_missing', 'warning', { memberId: id, field: 'education' }));
  }

  if (member.attendingEducation === true && age > 40) {
    flags.push(
      flag('attending_education_older', 'info', {
        memberId: id,
        field: 'attendingEducation',
        values: { age },
      }),
    );
  }

  /* Work ------------------------------------------------------------ */
  const isWorker =
    member.economicActivity === 'main_worker' || member.economicActivity === 'marginal_worker';

  if (isWorker && age < MIN_WORK_AGE) {
    flags.push(
      flag('child_worker', 'error', {
        memberId: id,
        field: 'economicActivity',
        values: { age, minAge: MIN_WORK_AGE },
      }),
    );
  }

  if (isWorker && !member.occupation.trim()) {
    flags.push(flag('occupation_missing', 'warning', { memberId: id, field: 'occupation' }));
  }

  if (!isWorker && member.occupation.trim() && member.economicActivity) {
    flags.push(
      flag('occupation_without_work', 'info', { memberId: id, field: 'economicActivity' }),
    );
  }

  if (member.economicActivity === 'student' && age > 45) {
    flags.push(
      flag('student_older', 'info', { memberId: id, field: 'economicActivity', values: { age } }),
    );
  }

  if (member.economicActivity === 'pensioner' && age < 40) {
    flags.push(
      flag('pensioner_young', 'info', { memberId: id, field: 'economicActivity', values: { age } }),
    );
  }

  if (!member.economicActivity && age >= 5) {
    flags.push(flag('economic_activity_missing', 'warning', { memberId: id, field: 'economicActivity' }));
  }

  /* Demographics ---------------------------------------------------- */
  if (!member.religion) {
    flags.push(flag('religion_missing', 'warning', { memberId: id, field: 'religion' }));
  }
  if (!member.casteCategory) {
    flags.push(flag('caste_missing', 'warning', { memberId: id, field: 'casteCategory' }));
  }
  if (!member.motherTongue) {
    flags.push(flag('mother_tongue_missing', 'warning', { memberId: id, field: 'motherTongue' }));
  }
  if (!member.disability) {
    flags.push(flag('disability_missing', 'info', { memberId: id, field: 'disability' }));
  }
  if (member.mobile.trim() && !isValidMobile(member.mobile)) {
    flags.push(flag('mobile_invalid', 'warning', { memberId: id, field: 'mobile' }));
  }

  /* Cross-member consistency ---------------------------------------- */
  if (head && head.id !== id && head.age !== null && head.age !== undefined) {
    const relation = member.relationToHead;
    if ((relation === 'son' || relation === 'daughter') && head.age - age < MIN_PARENT_GAP) {
      flags.push(
        flag('child_too_close_in_age', 'warning', {
          memberId: id,
          field: 'age',
          values: { age, headAge: head.age, gap: MIN_PARENT_GAP },
        }),
      );
    }
    if ((relation === 'father' || relation === 'mother') && age - head.age < MIN_PARENT_GAP) {
      flags.push(
        flag('parent_too_close_in_age', 'warning', {
          memberId: id,
          field: 'age',
          values: { age, headAge: head.age, gap: MIN_PARENT_GAP },
        }),
      );
    }
    if (relation === 'spouse' && head.maritalStatus === 'never_married') {
      flags.push(
        flag('spouse_of_unmarried_head', 'warning', { memberId: id, field: 'relationToHead' }),
      );
    }
  }

  // `household` is used for context-aware rules; referenced to keep signature honest.
  if (household.collectedBy === 'citizen' && member.relationToHead === 'head' && !member.mobile.trim()) {
    flags.push(flag('self_enumeration_no_contact', 'info', { memberId: id, field: 'mobile' }));
  }

  return flags;
}

export function validateHousehold(household: Household): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const members = household.members;

  /* Household composition ------------------------------------------- */
  if (members.length === 0) {
    flags.push(flag('no_members', 'error'));
  }

  const heads = members.filter((member) => member.relationToHead === 'head');
  if (members.length > 0 && heads.length === 0) {
    flags.push(flag('no_head', 'error'));
  } else if (heads.length > 1) {
    flags.push(flag('multiple_heads', 'error', { values: { count: heads.length } }));
  }

  const head = heads[0];
  if (head && head.age !== null && head.age !== undefined && head.age < 15) {
    flags.push(flag('head_too_young', 'warning', { memberId: head.id, values: { age: head.age } }));
  }

  const spouses = members.filter((member) => member.relationToHead === 'spouse');
  if (spouses.length > 1) {
    flags.push(flag('multiple_spouses', 'warning', { values: { count: spouses.length } }));
  }

  const names = new Map<string, number>();
  for (const member of members) {
    const key = member.name.trim().toLowerCase();
    if (!key) continue;
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  for (const [name, count] of names) {
    if (count > 1) {
      flags.push(flag('duplicate_member_name', 'warning', { values: { name, count } }));
    }
  }

  /* Location & address ---------------------------------------------- */
  if (!household.location && household.collectedBy === 'enumerator') {
    flags.push(flag('location_missing', 'warning', { field: 'location' }));
  }
  if (household.location && (household.location.accuracy ?? 0) > 100) {
    flags.push(
      flag('location_inaccurate', 'info', {
        field: 'location',
        values: { accuracy: Math.round(household.location.accuracy ?? 0) },
      }),
    );
  }
  if (!household.address.houseNumber.trim()) {
    flags.push(flag('house_number_missing', 'error', { field: 'houseNumber' }));
  }
  if (!household.address.village.trim() && !household.address.locality.trim()) {
    flags.push(flag('locality_missing', 'error', { field: 'locality' }));
  }
  if (!household.address.district.trim()) {
    flags.push(flag('district_missing', 'warning', { field: 'district' }));
  }
  if (!household.address.state.trim()) {
    flags.push(flag('state_missing', 'warning', { field: 'state' }));
  }
  if (household.address.pincode.trim() && !isValidPincode(household.address.pincode)) {
    flags.push(flag('pincode_invalid', 'warning', { field: 'pincode' }));
  }

  /* Housing ---------------------------------------------------------- */
  const housing = household.housing;
  if (!housing.buildingType) {
    flags.push(flag('building_type_missing', 'warning', { field: 'buildingType' }));
  }
  if (!housing.ownership) {
    flags.push(flag('ownership_missing', 'warning', { field: 'ownership' }));
  }
  if (housing.rooms === null || housing.rooms === undefined) {
    flags.push(flag('rooms_missing', 'warning', { field: 'rooms' }));
  } else if (housing.rooms <= 0) {
    flags.push(flag('rooms_zero', 'warning', { field: 'rooms' }));
  } else if (members.length > housing.rooms * 5) {
    flags.push(
      flag('overcrowding', 'info', {
        field: 'rooms',
        values: { members: members.length, rooms: housing.rooms },
      }),
    );
  }

  if (
    housing.marriedCouples !== null &&
    housing.marriedCouples !== undefined &&
    housing.marriedCouples * 2 > members.length &&
    members.length > 0
  ) {
    flags.push(
      flag('married_couples_exceed_members', 'warning', {
        field: 'marriedCouples',
        values: { couples: housing.marriedCouples, members: members.length },
      }),
    );
  }

  if (!housing.waterSource) {
    flags.push(flag('water_source_missing', 'warning', { field: 'waterSource' }));
  }
  if (!housing.toilet) {
    flags.push(flag('toilet_missing', 'warning', { field: 'toilet' }));
  }
  if (!housing.lighting) {
    flags.push(flag('lighting_missing', 'warning', { field: 'lighting' }));
  }
  if (!housing.cookingFuel) {
    flags.push(flag('fuel_missing', 'warning', { field: 'cookingFuel' }));
  }

  const powerAssets = ['television', 'refrigerator', 'washing_machine', 'air_conditioner', 'computer'];
  if (housing.lighting === 'none' && housing.assets.some((asset) => powerAssets.includes(asset))) {
    flags.push(flag('assets_without_power', 'info', { field: 'assets' }));
  }
  if (housing.assets.includes('internet') && !housing.assets.some((a) => ['smartphone', 'computer'].includes(a))) {
    flags.push(flag('internet_without_device', 'info', { field: 'assets' }));
  }

  /* Members ---------------------------------------------------------- */
  for (const member of members) {
    flags.push(...validateMember(member, household, head));
  }

  return flags;
}

export interface FlagSummary {
  errors: number;
  warnings: number;
  infos: number;
  total: number;
}

export function summariseFlags(flags: ValidationFlag[]): FlagSummary {
  const summary: FlagSummary = { errors: 0, warnings: 0, infos: 0, total: flags.length };
  for (const item of flags) {
    if (item.severity === 'error') summary.errors += 1;
    else if (item.severity === 'warning') summary.warnings += 1;
    else summary.infos += 1;
  }
  return summary;
}

/** A household may only be submitted once every hard error is resolved. */
export function canSubmit(flags: ValidationFlag[]): boolean {
  return !flags.some((item) => item.severity === 'error');
}

/** Completion percentage used by the form progress bar. */
export function completionPercent(household: Household): number {
  const checks: boolean[] = [
    Boolean(household.address.houseNumber.trim()),
    Boolean(household.address.village.trim() || household.address.locality.trim()),
    Boolean(household.address.district.trim()),
    Boolean(household.address.state.trim()),
    Boolean(household.location),
    Boolean(household.housing.buildingType),
    Boolean(household.housing.ownership),
    household.housing.rooms !== null,
    Boolean(household.housing.waterSource),
    Boolean(household.housing.toilet),
    Boolean(household.housing.lighting),
    Boolean(household.housing.cookingFuel),
    household.members.length > 0,
    household.members.every((member) => member.name.trim() && member.age !== null),
    household.members.every((member) => Boolean(member.gender && member.relationToHead)),
    household.members.every((member) => Boolean(member.religion && member.casteCategory)),
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}
