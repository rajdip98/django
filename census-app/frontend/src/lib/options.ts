/** Option lists for the census questionnaire.
 *
 * Every option carries an i18n key so the whole schedule can be presented in any
 * supported language. Values are stable identifiers and must not change once
 * data has been collected — they are what gets exported and analysed.
 */

import type {
  BuildingType,
  CasteCategory,
  CookingFuel,
  Disability,
  EconomicActivity,
  EducationLevel,
  Gender,
  LightingSource,
  MaritalStatus,
  Ownership,
  RelationToHead,
  ToiletType,
  WaterSource,
} from './types';

export interface Option<T extends string = string> {
  value: T;
  key: string;
}

const opt = <T extends string>(value: T, key: string): Option<T> => ({ value, key });

export const RELATION_OPTIONS: Option<RelationToHead>[] = [
  opt('head', 'opt.relation.head'),
  opt('spouse', 'opt.relation.spouse'),
  opt('son', 'opt.relation.son'),
  opt('daughter', 'opt.relation.daughter'),
  opt('father', 'opt.relation.father'),
  opt('mother', 'opt.relation.mother'),
  opt('brother', 'opt.relation.brother'),
  opt('sister', 'opt.relation.sister'),
  opt('grandson', 'opt.relation.grandson'),
  opt('granddaughter', 'opt.relation.granddaughter'),
  opt('son_in_law', 'opt.relation.son_in_law'),
  opt('daughter_in_law', 'opt.relation.daughter_in_law'),
  opt('father_in_law', 'opt.relation.father_in_law'),
  opt('mother_in_law', 'opt.relation.mother_in_law'),
  opt('other_relative', 'opt.relation.other_relative'),
  opt('non_relative', 'opt.relation.non_relative'),
];

export const GENDER_OPTIONS: Option<Gender>[] = [
  opt('male', 'opt.gender.male'),
  opt('female', 'opt.gender.female'),
  opt('transgender', 'opt.gender.transgender'),
];

export const MARITAL_OPTIONS: Option<MaritalStatus>[] = [
  opt('never_married', 'opt.marital.never_married'),
  opt('married', 'opt.marital.married'),
  opt('widowed', 'opt.marital.widowed'),
  opt('separated', 'opt.marital.separated'),
  opt('divorced', 'opt.marital.divorced'),
];

export const CASTE_OPTIONS: Option<CasteCategory>[] = [
  opt('general', 'opt.caste.general'),
  opt('sc', 'opt.caste.sc'),
  opt('st', 'opt.caste.st'),
  opt('obc', 'opt.caste.obc'),
];

export const EDUCATION_OPTIONS: Option<EducationLevel>[] = [
  opt('illiterate', 'opt.education.illiterate'),
  opt('literate_no_schooling', 'opt.education.literate_no_schooling'),
  opt('below_primary', 'opt.education.below_primary'),
  opt('primary', 'opt.education.primary'),
  opt('middle', 'opt.education.middle'),
  opt('secondary', 'opt.education.secondary'),
  opt('higher_secondary', 'opt.education.higher_secondary'),
  opt('diploma', 'opt.education.diploma'),
  opt('graduate', 'opt.education.graduate'),
  opt('postgraduate', 'opt.education.postgraduate'),
  opt('doctorate', 'opt.education.doctorate'),
];

/** Minimum plausible age for each education level — drives validation. */
export const EDUCATION_MIN_AGE: Record<EducationLevel, number> = {
  illiterate: 0,
  literate_no_schooling: 3,
  below_primary: 4,
  primary: 9,
  middle: 12,
  secondary: 14,
  higher_secondary: 16,
  diploma: 17,
  graduate: 19,
  postgraduate: 21,
  doctorate: 24,
};

export const ECONOMIC_OPTIONS: Option<EconomicActivity>[] = [
  opt('main_worker', 'opt.economic.main_worker'),
  opt('marginal_worker', 'opt.economic.marginal_worker'),
  opt('seeking_work', 'opt.economic.seeking_work'),
  opt('student', 'opt.economic.student'),
  opt('household_duties', 'opt.economic.household_duties'),
  opt('dependent', 'opt.economic.dependent'),
  opt('pensioner', 'opt.economic.pensioner'),
  opt('other_non_worker', 'opt.economic.other_non_worker'),
];

export const DISABILITY_OPTIONS: Option<Disability>[] = [
  opt('none', 'opt.disability.none'),
  opt('visual', 'opt.disability.visual'),
  opt('hearing', 'opt.disability.hearing'),
  opt('speech', 'opt.disability.speech'),
  opt('locomotor', 'opt.disability.locomotor'),
  opt('intellectual', 'opt.disability.intellectual'),
  opt('mental_illness', 'opt.disability.mental_illness'),
  opt('multiple', 'opt.disability.multiple'),
  opt('other', 'opt.disability.other'),
];

export const BUILDING_OPTIONS: Option<BuildingType>[] = [
  opt('pucca', 'opt.building.pucca'),
  opt('semi_pucca', 'opt.building.semi_pucca'),
  opt('kutcha', 'opt.building.kutcha'),
  opt('other', 'opt.building.other'),
];

export const OWNERSHIP_OPTIONS: Option<Ownership>[] = [
  opt('owned', 'opt.ownership.owned'),
  opt('rented', 'opt.ownership.rented'),
  opt('other', 'opt.ownership.other'),
];

export const WATER_OPTIONS: Option<WaterSource>[] = [
  opt('tap_treated', 'opt.water.tap_treated'),
  opt('tap_untreated', 'opt.water.tap_untreated'),
  opt('covered_well', 'opt.water.covered_well'),
  opt('uncovered_well', 'opt.water.uncovered_well'),
  opt('handpump', 'opt.water.handpump'),
  opt('tubewell', 'opt.water.tubewell'),
  opt('spring', 'opt.water.spring'),
  opt('river_canal', 'opt.water.river_canal'),
  opt('tank_pond', 'opt.water.tank_pond'),
  opt('other', 'opt.water.other'),
];

export const TOILET_OPTIONS: Option<ToiletType>[] = [
  opt('flush_piped_sewer', 'opt.toilet.flush_piped_sewer'),
  opt('flush_septic', 'opt.toilet.flush_septic'),
  opt('pit_latrine', 'opt.toilet.pit_latrine'),
  opt('other_latrine', 'opt.toilet.other_latrine'),
  opt('public_latrine', 'opt.toilet.public_latrine'),
  opt('open', 'opt.toilet.open'),
];

export const DRAINAGE_OPTIONS: Option<'closed' | 'open' | 'none'>[] = [
  opt('closed', 'opt.drainage.closed'),
  opt('open', 'opt.drainage.open'),
  opt('none', 'opt.drainage.none'),
];

export const LIGHTING_OPTIONS: Option<LightingSource>[] = [
  opt('electricity', 'opt.lighting.electricity'),
  opt('solar', 'opt.lighting.solar'),
  opt('kerosene', 'opt.lighting.kerosene'),
  opt('other_oil', 'opt.lighting.other_oil'),
  opt('none', 'opt.lighting.none'),
];

export const FUEL_OPTIONS: Option<CookingFuel>[] = [
  opt('lpg_png', 'opt.fuel.lpg_png'),
  opt('electricity', 'opt.fuel.electricity'),
  opt('biogas', 'opt.fuel.biogas'),
  opt('firewood', 'opt.fuel.firewood'),
  opt('crop_residue', 'opt.fuel.crop_residue'),
  opt('cow_dung', 'opt.fuel.cow_dung'),
  opt('coal_charcoal', 'opt.fuel.coal_charcoal'),
  opt('kerosene', 'opt.fuel.kerosene'),
  opt('other', 'opt.fuel.other'),
];

export const ASSET_OPTIONS: Option[] = [
  opt('radio', 'opt.asset.radio'),
  opt('television', 'opt.asset.television'),
  opt('computer', 'opt.asset.computer'),
  opt('internet', 'opt.asset.internet'),
  opt('phone_landline', 'opt.asset.phone_landline'),
  opt('mobile', 'opt.asset.mobile'),
  opt('smartphone', 'opt.asset.smartphone'),
  opt('bicycle', 'opt.asset.bicycle'),
  opt('two_wheeler', 'opt.asset.two_wheeler'),
  opt('car', 'opt.asset.car'),
  opt('refrigerator', 'opt.asset.refrigerator'),
  opt('washing_machine', 'opt.asset.washing_machine'),
  opt('air_conditioner', 'opt.asset.air_conditioner'),
  opt('bank_account', 'opt.asset.bank_account'),
];

export const RELIGION_OPTIONS: Option[] = [
  opt('hindu', 'opt.religion.hindu'),
  opt('muslim', 'opt.religion.muslim'),
  opt('christian', 'opt.religion.christian'),
  opt('sikh', 'opt.religion.sikh'),
  opt('buddhist', 'opt.religion.buddhist'),
  opt('jain', 'opt.religion.jain'),
  opt('parsi', 'opt.religion.parsi'),
  opt('jewish', 'opt.religion.jewish'),
  opt('other', 'opt.religion.other'),
  opt('none', 'opt.religion.none'),
];

/** Scheduled languages offered as mother-tongue suggestions. */
export const MOTHER_TONGUE_OPTIONS: Option[] = [
  opt('assamese', 'opt.tongue.assamese'),
  opt('bengali', 'opt.tongue.bengali'),
  opt('bodo', 'opt.tongue.bodo'),
  opt('dogri', 'opt.tongue.dogri'),
  opt('english', 'opt.tongue.english'),
  opt('gujarati', 'opt.tongue.gujarati'),
  opt('hindi', 'opt.tongue.hindi'),
  opt('kannada', 'opt.tongue.kannada'),
  opt('kashmiri', 'opt.tongue.kashmiri'),
  opt('konkani', 'opt.tongue.konkani'),
  opt('maithili', 'opt.tongue.maithili'),
  opt('malayalam', 'opt.tongue.malayalam'),
  opt('manipuri', 'opt.tongue.manipuri'),
  opt('marathi', 'opt.tongue.marathi'),
  opt('nepali', 'opt.tongue.nepali'),
  opt('odia', 'opt.tongue.odia'),
  opt('punjabi', 'opt.tongue.punjabi'),
  opt('sanskrit', 'opt.tongue.sanskrit'),
  opt('santali', 'opt.tongue.santali'),
  opt('sindhi', 'opt.tongue.sindhi'),
  opt('tamil', 'opt.tongue.tamil'),
  opt('telugu', 'opt.tongue.telugu'),
  opt('urdu', 'opt.tongue.urdu'),
  opt('other', 'opt.tongue.other'),
];

/** Relations that imply a gender — used by the consistency checker. */
export const RELATION_EXPECTED_GENDER: Partial<Record<RelationToHead, Gender>> = {
  son: 'male',
  daughter: 'female',
  father: 'male',
  mother: 'female',
  brother: 'male',
  sister: 'female',
  grandson: 'male',
  granddaughter: 'female',
  son_in_law: 'male',
  daughter_in_law: 'female',
  father_in_law: 'male',
  mother_in_law: 'female',
};

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];
