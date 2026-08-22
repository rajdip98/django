import { describe, expect, it } from 'vitest';

import { blankHousehold, blankMember, householdsToCsv, membersToCsv, parseBackup, makeBackup } from '../lib/household';
import { canSubmit, completionPercent, summariseFlags, validateHousehold } from '../lib/validation';
import type { Household, Member } from '../lib/types';

function baseHousehold(): Household {
  const household = blankHousehold({
    zoneId: 'zone-1',
    zoneCode: 'WB01',
    enumeratorId: 'enum-1',
    enumeratorName: 'Ravi',
    collectedBy: 'enumerator',
    language: 'en',
    state: 'West Bengal',
    district: 'North 24 Parganas',
  });

  household.address.houseNumber = '12A';
  household.address.village = 'Salt Lake';
  household.address.pincode = '700091';
  household.location = { lat: 22.57, lng: 88.36, accuracy: 10 };
  household.housing = {
    ...household.housing,
    buildingType: 'pucca',
    ownership: 'owned',
    rooms: 3,
    waterSource: 'tap_treated',
    toilet: 'flush_septic',
    lighting: 'electricity',
    cookingFuel: 'lpg_png',
  };
  household.members = [head()];
  return household;
}

function head(overrides: Partial<Member> = {}): Member {
  return blankMember({
    name: 'Asha Debnath',
    relationToHead: 'head',
    gender: 'female',
    age: 42,
    maritalStatus: 'married',
    religion: 'hindu',
    casteCategory: 'general',
    motherTongue: 'bengali',
    literate: true,
    education: 'graduate',
    economicActivity: 'main_worker',
    occupation: 'Teacher',
    disability: 'none',
    ...overrides,
  });
}

const codes = (household: Household): string[] =>
  validateHousehold(household).map((flag) => flag.code);

describe('household composition', () => {
  it('accepts a well-formed household', () => {
    const flags = validateHousehold(baseHousehold());
    expect(summariseFlags(flags).errors).toBe(0);
    expect(canSubmit(flags)).toBe(true);
  });

  it('requires at least one member', () => {
    const household = baseHousehold();
    household.members = [];
    expect(codes(household)).toContain('no_members');
    expect(canSubmit(validateHousehold(household))).toBe(false);
  });

  it('requires exactly one head', () => {
    const household = baseHousehold();
    household.members = [head({ relationToHead: 'son' })];
    expect(codes(household)).toContain('no_head');

    household.members = [head(), head({ name: 'Other' })];
    expect(codes(household)).toContain('multiple_heads');
  });

  it('flags duplicate names', () => {
    const household = baseHousehold();
    household.members = [head(), head({ relationToHead: 'sister' })];
    expect(codes(household)).toContain('duplicate_member_name');
  });

  it('flags a head who is a child', () => {
    const household = baseHousehold();
    household.members = [head({ age: 11, maritalStatus: 'never_married', education: 'primary' })];
    expect(codes(household)).toContain('head_too_young');
  });
});

describe('age consistency', () => {
  it('rejects an age outside the plausible range', () => {
    const household = baseHousehold();
    household.members = [head({ age: 200 })];
    expect(codes(household)).toContain('age_out_of_range');
    expect(canSubmit(validateHousehold(household))).toBe(false);
  });

  it('requires an age', () => {
    const household = baseHousehold();
    household.members = [head({ age: null })];
    expect(codes(household)).toContain('member_age_missing');
  });

  it('flags education impossible for the age', () => {
    const household = baseHousehold();
    household.members = [head({ age: 8, education: 'graduate', maritalStatus: 'never_married' })];
    expect(codes(household)).toContain('education_exceeds_age');
  });

  it('does not flag education that fits the age', () => {
    const household = baseHousehold();
    household.members = [head({ age: 30, education: 'graduate' })];
    expect(codes(household)).not.toContain('education_exceeds_age');
  });

  it('treats marriage below the legal age as an error', () => {
    const household = baseHousehold();
    household.members = [head({ age: 15, maritalStatus: 'married', education: 'middle' })];
    const flags = validateHousehold(household);
    expect(flags.some((flag) => flag.code === 'married_below_legal_age' && flag.severity === 'error')).toBe(true);
    expect(canSubmit(flags)).toBe(false);
  });

  it('rejects an age at marriage greater than the current age', () => {
    const household = baseHousehold();
    household.members = [head({ age: 30, ageAtMarriage: 40 })];
    expect(codes(household)).toContain('age_at_marriage_exceeds_age');
  });

  it('treats a working child as an error', () => {
    const household = baseHousehold();
    household.members = [
      head(),
      blankMember({
        name: 'Ravi',
        relationToHead: 'son',
        gender: 'male',
        age: 9,
        maritalStatus: 'never_married',
        economicActivity: 'main_worker',
        occupation: 'Shop',
        religion: 'hindu',
        casteCategory: 'general',
        motherTongue: 'bengali',
        education: 'primary',
        literate: true,
        disability: 'none',
      }),
    ];
    const flags = validateHousehold(household);
    expect(flags.some((flag) => flag.code === 'child_worker' && flag.severity === 'error')).toBe(true);
  });
});

describe('cross-member consistency', () => {
  it('flags a child too close in age to the head', () => {
    const household = baseHousehold();
    household.members = [
      head({ age: 30 }),
      blankMember({
        name: 'Ravi',
        relationToHead: 'son',
        gender: 'male',
        age: 25,
        maritalStatus: 'never_married',
        religion: 'hindu',
        casteCategory: 'general',
        motherTongue: 'bengali',
        education: 'graduate',
        literate: true,
        economicActivity: 'student',
        disability: 'none',
      }),
    ];
    expect(codes(household)).toContain('child_too_close_in_age');
  });

  it('flags a relation that contradicts the recorded sex', () => {
    const household = baseHousehold();
    household.members = [
      head(),
      blankMember({
        name: 'Ravi',
        relationToHead: 'son',
        gender: 'female',
        age: 12,
        maritalStatus: 'never_married',
        religion: 'hindu',
        casteCategory: 'general',
        motherTongue: 'bengali',
        education: 'middle',
        literate: true,
        economicActivity: 'student',
        disability: 'none',
      }),
    ];
    expect(codes(household)).toContain('gender_relation_mismatch');
  });

  it('does not flag a transgender member against an expected sex', () => {
    const household = baseHousehold();
    household.members = [
      head(),
      blankMember({
        name: 'Ravi',
        relationToHead: 'son',
        gender: 'transgender',
        age: 12,
        maritalStatus: 'never_married',
        religion: 'hindu',
        casteCategory: 'general',
        motherTongue: 'bengali',
        education: 'middle',
        literate: true,
        economicActivity: 'student',
        disability: 'none',
      }),
    ];
    expect(codes(household)).not.toContain('gender_relation_mismatch');
  });

  it('flags a spouse of a never-married head', () => {
    const household = baseHousehold();
    household.members = [
      head({ maritalStatus: 'never_married' }),
      blankMember({
        name: 'Bikash',
        relationToHead: 'spouse',
        gender: 'male',
        age: 45,
        maritalStatus: 'married',
        religion: 'hindu',
        casteCategory: 'general',
        motherTongue: 'bengali',
        education: 'graduate',
        literate: true,
        economicActivity: 'main_worker',
        occupation: 'Clerk',
        disability: 'none',
      }),
    ];
    expect(codes(household)).toContain('spouse_of_unmarried_head');
  });
});

describe('housing and address', () => {
  it('requires a house number and a locality', () => {
    const household = baseHousehold();
    household.address.houseNumber = '';
    household.address.village = '';
    household.address.locality = '';
    const flags = validateHousehold(household);
    expect(flags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining(['house_number_missing', 'locality_missing']),
    );
    expect(canSubmit(flags)).toBe(false);
  });

  it('validates the PIN code format', () => {
    const household = baseHousehold();
    household.address.pincode = '012345';
    expect(codes(household)).toContain('pincode_invalid');

    household.address.pincode = '700091';
    expect(codes(household)).not.toContain('pincode_invalid');
  });

  it('flags appliances without an electricity supply', () => {
    const household = baseHousehold();
    household.housing.lighting = 'none';
    household.housing.assets = ['refrigerator'];
    expect(codes(household)).toContain('assets_without_power');
  });

  it('flags more married couples than the household can hold', () => {
    const household = baseHousehold();
    household.housing.marriedCouples = 4;
    expect(codes(household)).toContain('married_couples_exceed_members');
  });

  it('flags a missing GPS reading for enumerator collection only', () => {
    const household = baseHousehold();
    household.location = null;
    expect(codes(household)).toContain('location_missing');

    household.collectedBy = 'citizen';
    expect(codes(household)).not.toContain('location_missing');
  });
});

describe('completion', () => {
  it('grows as the schedule is filled in', () => {
    const empty = blankHousehold({
      zoneId: '',
      enumeratorId: 'e',
      enumeratorName: 'E',
      collectedBy: 'enumerator',
      language: 'en',
    });
    expect(completionPercent(empty)).toBeLessThan(40);
    expect(completionPercent(baseHousehold())).toBe(100);
  });
});

describe('export and backup', () => {
  it('writes CSV with a BOM and escapes commas', () => {
    const household = baseHousehold();
    household.address.village = 'Salt Lake, Sector V';
    const csv = householdsToCsv([household]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Salt Lake, Sector V"');
    expect(csv.split('\r\n')[0]).toContain('household_number');
  });

  it('writes one CSV row per member', () => {
    const household = baseHousehold();
    household.members = [head(), head({ name: 'Bikash', relationToHead: 'spouse', gender: 'male' })];
    const rows = membersToCsv([household]).trim().split('\r\n');
    expect(rows).toHaveLength(3); // header + 2 members
    expect(rows[1]).toContain('Asha Debnath');
  });

  it('round-trips a backup', () => {
    const household = baseHousehold();
    const text = JSON.stringify(makeBackup([household]));
    const restored = parseBackup(text);
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(household.id);
    expect(restored[0].sync).toBe('local');
  });

  it('rejects a file that is not a census backup', () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow();
    expect(() => parseBackup('[]')).toThrow();
  });
});
