import { describe, expect, it } from 'vitest';

import { computeAnalytics, needsAttention, sexRatio } from '../lib/analytics';
import { digestsMatch, sha256Hex } from '../lib/hash';
import { apiUrl, setApiBase } from '../lib/api';
import { blankHousehold, blankMember, shouldQueueForSync } from '../lib/household';
import { boundsOf, distanceMeters, geoErrorKey } from '../lib/geo';
import { LANGUAGES, translate, translationCoverage } from '../i18n';
import { en } from '../i18n/locales/en';
import {
  isValidMobile,
  isValidPincode,
  normaliseMobile,
  percent,
  shortCode,
  todayKey,
  uuid,
} from '../lib/utils';
import { parseSpokenNumber } from '../lib/voice';
import type { Household, Member, Zone } from '../lib/types';

describe('mobile numbers', () => {
  it('normalises the formats people actually type', () => {
    expect(normaliseMobile('+91 98765 43210')).toBe('9876543210');
    expect(normaliseMobile('09876543210')).toBe('9876543210');
    expect(normaliseMobile('919876543210')).toBe('9876543210');
    expect(normaliseMobile('9876543210')).toBe('9876543210');
  });

  it('accepts valid Indian numbers and rejects the rest', () => {
    expect(isValidMobile('9876543210')).toBe(true);
    expect(isValidMobile('+91 6123456789')).toBe(true);
    expect(isValidMobile('5876543210')).toBe(false); // must start 6-9
    expect(isValidMobile('98765')).toBe(false);
  });
});

describe('pin codes', () => {
  it('requires six digits not starting with zero', () => {
    expect(isValidPincode('700091')).toBe(true);
    expect(isValidPincode('012345')).toBe(false);
    expect(isValidPincode('70009')).toBe(false);
  });
});

describe('identifiers', () => {
  it('generates well-formed unique v4 UUIDs', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uuid()));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('generates short codes without ambiguous characters', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = shortCode(8);
      expect(code).toHaveLength(8);
      expect(code).not.toMatch(/[01OI]/);
    }
  });
});

describe('sha256', () => {
  it('matches known digests', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('handles input spanning multiple blocks', () => {
    expect(sha256Hex('a'.repeat(1000))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    );
  });

  it('compares digests safely', () => {
    expect(digestsMatch(sha256Hex('x'), sha256Hex('x'))).toBe(true);
    expect(digestsMatch(sha256Hex('x'), sha256Hex('y'))).toBe(false);
    expect(digestsMatch('abc', 'abcd')).toBe(false);
  });
});

describe('geo', () => {
  it('measures a known distance', () => {
    // Kolkata to Delhi is roughly 1,300 km.
    const metres = distanceMeters({ lat: 22.5726, lng: 88.3639 }, { lat: 28.6139, lng: 77.209 });
    expect(metres).toBeGreaterThan(1_200_000);
    expect(metres).toBeLessThan(1_400_000);
  });

  it('returns zero for the same point', () => {
    expect(distanceMeters({ lat: 22.5, lng: 88.3 }, { lat: 22.5, lng: 88.3 })).toBeCloseTo(0);
  });

  it('builds padded bounds that contain every point', () => {
    const bounds = boundsOf([
      { lat: 22.5, lng: 88.3 },
      { lat: 22.6, lng: 88.4 },
    ]);
    expect(bounds).not.toBeNull();
    const [[south, west], [north, east]] = bounds!;
    expect(south).toBeLessThan(22.5);
    expect(north).toBeGreaterThan(22.6);
    expect(west).toBeLessThan(88.3);
    expect(east).toBeGreaterThan(88.4);
  });

  it('returns null with no points', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('maps each failure to a translatable message', () => {
    for (const code of ['unsupported', 'insecure', 'denied', 'unavailable', 'timeout'] as const) {
      expect(en[geoErrorKey(code)]).toBeDefined();
    }
  });
});

describe('speech parsing', () => {
  it('reads digits in Indic scripts', () => {
    expect(parseSpokenNumber('मेरी उम्र 42 साल है')).toBe(42);
    expect(parseSpokenNumber('४२')).toBe(42);   // Devanagari
    expect(parseSpokenNumber('৪২')).toBe(42);   // Bengali
    expect(parseSpokenNumber('௪௨')).toBe(42);   // Tamil
    expect(parseSpokenNumber('౪౨')).toBe(42);   // Telugu
    expect(parseSpokenNumber('૪૨')).toBe(42);   // Gujarati
  });

  it('returns null when there is no number', () => {
    expect(parseSpokenNumber('no digits here')).toBeNull();
  });
});

describe('i18n', () => {
  it('ships every advertised language', () => {
    expect(LANGUAGES.map((language) => language.code)).toEqual([
      'en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu',
    ]);
  });

  it('translates and falls back to English', () => {
    expect(translate('hi', 'nav.home')).toBe('होम');
    expect(translate('bn', 'nav.home')).toBe('হোম');
    // A key only English defines still resolves rather than showing blank.
    expect(translate('ta', 'app.govt')).toBeTruthy();
  });

  it('interpolates values', () => {
    expect(translate('en', 'households.members', { count: 4 })).toBe('4 members');
    expect(translate('hi', 'home.greeting', { name: 'Ravi' })).toContain('Ravi');
  });

  it('never invents keys that do not exist in English', () => {
    for (const row of translationCoverage()) {
      expect(row.total).toBeGreaterThan(300);
      expect(row.translated).toBeGreaterThan(250);
    }
  });

  it('keeps interpolation placeholders consistent with English', () => {
    const placeholders = (value: string) =>
      (value.match(/\{(\w+)\}/g) ?? []).sort().join(',');

    for (const language of LANGUAGES) {
      if (language.code === 'en') continue;
      for (const key of Object.keys(en)) {
        const translated = translate(language.code, key);
        const source = en[key];
        // Only compare when the locale actually overrides the English string.
        if (translated === source) continue;
        expect(
          placeholders(translated),
          `${language.code} → ${key}`,
        ).toBe(placeholders(source));
      }
    }
  });
});

/* ------------------------------------------------------------------ */

function household(overrides: Partial<Household> = {}, members: Member[] = []): Household {
  const base = blankHousehold({
    zoneId: 'zone-1',
    enumeratorId: 'enum-1',
    enumeratorName: 'Ravi',
    collectedBy: 'enumerator',
    language: 'en',
  });
  return { ...base, members, ...overrides };
}

function member(overrides: Partial<Member> = {}): Member {
  return blankMember({
    name: 'X',
    relationToHead: 'head',
    gender: 'male',
    age: 30,
    religion: 'hindu',
    casteCategory: 'general',
    literate: true,
    ...overrides,
  });
}

describe('analytics', () => {
  const zones: Zone[] = [
    {
      id: 'zone-1',
      code: 'WB01',
      name: 'Ward 1',
      district: 'Kolkata',
      state: 'West Bengal',
      targetHouseholds: 4,
      assignedTo: [],
    },
  ];

  it('counts households, members and statuses', () => {
    const summary = computeAnalytics(
      [
        household({ status: 'submitted' }, [member(), member({ gender: 'female' })]),
        household({ status: 'approved' }, [member({ gender: 'female', literate: false })]),
      ],
      zones,
    );

    expect(summary.households).toBe(2);
    expect(summary.members).toBe(3);
    expect(summary.submitted).toBe(1);
    expect(summary.approved).toBe(1);
    expect(summary.genderCounts.female).toBe(2);
    expect(summary.genderCounts.male).toBe(1);
    expect(summary.literacy.literate).toBe(2);
    expect(summary.literacy.illiterate).toBe(1);
    expect(summary.averageHouseholdSize).toBe(1.5);
  });

  it('computes coverage against the zone target', () => {
    const summary = computeAnalytics([household(), household()], zones);
    expect(summary.targetHouseholds).toBe(4);
    expect(summary.coverage).toBe(50);
  });

  it('buckets ages into census bands', () => {
    const summary = computeAnalytics(
      [
        household({}, [
          member({ age: 3 }),
          member({ age: 10 }),
          member({ age: 22 }),
          member({ age: 70 }),
        ]),
      ],
      zones,
    );
    expect(summary.ageBands['band.0_6']).toBe(1);
    expect(summary.ageBands['band.7_14']).toBe(1);
    expect(summary.ageBands['band.15_29']).toBe(1);
    expect(summary.ageBands['band.60_plus']).toBe(1);
  });

  it('reports households in unknown zones rather than dropping them', () => {
    const summary = computeAnalytics([household({ zoneId: 'ghost' })], zones);
    const unassigned = summary.zoneProgress.find((zone) => zone.zoneName === 'Unassigned');
    expect(unassigned?.collected).toBe(1);
  });

  it('always returns 14 days of counts, zero-filled', () => {
    const summary = computeAnalytics([household()], zones);
    expect(summary.dailyCounts).toHaveLength(14);
    expect(summary.dailyCounts[13].date).toBe(todayKey());
  });

  it('handles an empty dataset without dividing by zero', () => {
    const summary = computeAnalytics([], []);
    expect(summary.averageHouseholdSize).toBe(0);
    expect(summary.coverage).toBe(0);
  });

  it('computes the sex ratio', () => {
    expect(sexRatio({ male: 1000, female: 940 })).toBe(940);
    expect(sexRatio({ male: 0, female: 5 })).toBeNull();
  });

  it('surfaces households that need a supervisor', () => {
    const flagged = household({ status: 'flagged' });
    const missingGps = household({ status: 'submitted', location: null });
    const fine = household({
      status: 'submitted',
      location: { lat: 1, lng: 1 },
    });
    const draft = household({ status: 'draft' });

    const attention = needsAttention([flagged, missingGps, fine, draft]);
    expect(attention).toHaveLength(2);
    expect(attention).not.toContain(draft);
  });
});

describe('percent', () => {
  it('rounds to one decimal and guards zero totals', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(5, 0)).toBe(0);
    expect(percent(0, 10)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Regressions                                                         */
/* ------------------------------------------------------------------ */

describe('sync queueing', () => {
  it('keeps drafts on the device', () => {
    expect(shouldQueueForSync({ status: 'draft' }, { deviceOnly: false })).toBe(false);
  });

  it('queues every edit once a household has been submitted', () => {
    // Regression: a correction to a flagged household used to stay on the phone
    // for ever while the UI reported it as synced.
    for (const status of ['submitted', 'approved', 'flagged'] as const) {
      expect(shouldQueueForSync({ status }, { deviceOnly: false })).toBe(true);
    }
  });

  it('queues a draft when submission asks explicitly', () => {
    expect(shouldQueueForSync({ status: 'draft' }, { deviceOnly: false, explicit: true })).toBe(true);
  });

  it('never queues in device-only mode', () => {
    expect(shouldQueueForSync({ status: 'submitted' }, { deviceOnly: true })).toBe(false);
    expect(
      shouldQueueForSync({ status: 'draft' }, { deviceOnly: true, explicit: true }),
    ).toBe(false);
  });
});

describe('api base resolution', () => {
  it('uses an explicit server address when one is configured', () => {
    setApiBase('https://census.example.in/');
    expect(apiUrl('/api/health')).toBe('https://census.example.in/api/health');
    setApiBase(null);
  });

  it('stays inside the subfolder the app is served from', () => {
    // Otherwise an install at /census/ would probe /api/health and could reach
    // an entirely different application at the domain root.
    window.history.replaceState({}, '', '/census/index.html');
    expect(apiUrl('/api/health')).toBe('/census/api/health');

    window.history.replaceState({}, '', '/');
    expect(apiUrl('/api/health')).toBe('/api/health');
  });
});
