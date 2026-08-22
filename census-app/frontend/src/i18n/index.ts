/** Internationalisation.
 *
 * English is the source of truth: every other locale is a partial override and
 * any missing key falls back to English, so a half-translated language never
 * shows blank labels. Translations live in `locales/` — adding a language is a
 * matter of dropping a file in and registering it in LANGUAGES below.
 */

import type { LanguageCode } from '../lib/types';
import { en } from './locales/en';
import { hi } from './locales/hi';
import { bn } from './locales/bn';
import { ta } from './locales/ta';
import { te } from './locales/te';
import { mr } from './locales/mr';
import { gu } from './locales/gu';

export type Dictionary = Record<string, string>;

export interface LanguageMeta {
  code: LanguageCode;
  /** Name in the language itself — always shown in the picker. */
  nativeName: string;
  englishName: string;
  /** BCP-47 tag used for speech recognition and date formatting. */
  locale: string;
}

export const LANGUAGES: LanguageMeta[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', locale: 'en-IN' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', locale: 'hi-IN' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', locale: 'bn-IN' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', locale: 'ta-IN' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', locale: 'te-IN' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi', locale: 'mr-IN' },
  { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati', locale: 'gu-IN' },
];

const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, hi, bn, ta, te, mr, gu };

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGES.some((language) => language.code === value);
}

export function languageMeta(code: LanguageCode): LanguageMeta {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}

/** Best-effort guess from the browser, used only on first launch. */
export function detectLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split('-')[0];
    if (isLanguageCode(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

export type TranslateValues = Record<string, string | number>;

function interpolate(template: string, values?: TranslateValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/** Translate `key` into `language`, falling back to English then the key itself. */
export function translate(
  language: LanguageCode,
  key: string,
  values?: TranslateValues,
): string {
  const dictionary = DICTIONARIES[language] ?? en;
  const template = dictionary[key] ?? en[key];
  if (template === undefined) {
    if (import.meta.env.DEV) console.warn(`census i18n: missing key "${key}"`);
    return key;
  }
  return interpolate(template, values);
}

/** Keys present in English but missing elsewhere — surfaced in the admin panel. */
export function translationCoverage(): Array<{ code: LanguageCode; translated: number; total: number }> {
  const total = Object.keys(en).length;
  return LANGUAGES.map((language) => ({
    code: language.code,
    translated: Object.keys(DICTIONARIES[language.code] ?? {}).filter((key) => key in en).length,
    total,
  }));
}
