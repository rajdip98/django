/** Add or edit one household member — the individual slip of the census
 * schedule, presented as a scrollable sheet. */

import { useMemo, useState } from 'react';

import {
  ChipSelect,
  NumberField,
  PlainSelectField,
  SelectField,
  TextField,
  TriToggle,
} from './Fields';
import { FlagList } from './FlagList';
import { Sheet } from './Sheet';
import {
  CASTE_OPTIONS,
  DISABILITY_OPTIONS,
  ECONOMIC_OPTIONS,
  EDUCATION_OPTIONS,
  GENDER_OPTIONS,
  MARITAL_OPTIONS,
  MOTHER_TONGUE_OPTIONS,
  RELATION_OPTIONS,
  RELIGION_OPTIONS,
} from '../lib/options';
import { useApp } from '../lib/store';
import type { Household, Member } from '../lib/types';
import { validateHousehold } from '../lib/validation';
import { parseSpokenNumber } from '../lib/voice';

export function MemberEditor({
  member,
  household,
  onSave,
  onClose,
  onRemove,
}: {
  member: Member;
  /** The household as it will be once this member is saved — used for live checks. */
  household: Household;
  onSave: (member: Member) => void;
  onClose: () => void;
  onRemove?: () => void;
}): JSX.Element {
  const { t } = useApp();
  const [draft, setDraft] = useState<Member>(member);

  const update = <K extends keyof Member>(key: K, value: Member[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const isMarried =
    draft.maritalStatus === 'married' ||
    draft.maritalStatus === 'widowed' ||
    draft.maritalStatus === 'separated' ||
    draft.maritalStatus === 'divorced';

  const isWorker =
    draft.economicActivity === 'main_worker' || draft.economicActivity === 'marginal_worker';

  // Live validation limited to this member, so the enumerator fixes issues here
  // rather than discovering them at the review step.
  const memberFlags = useMemo(() => {
    const preview: Household = {
      ...household,
      members: household.members.some((item) => item.id === draft.id)
        ? household.members.map((item) => (item.id === draft.id ? draft : item))
        : [...household.members, draft],
    };
    return validateHousehold(preview).filter((flag) => flag.memberId === draft.id);
  }, [draft, household]);

  const blockingFlags = memberFlags.filter((flag) => flag.severity === 'error');

  const religionOptions = RELIGION_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }));

  const tongueOptions = MOTHER_TONGUE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }));

  return (
    <Sheet
      title={draft.name.trim() || t('form.addMember')}
      onClose={onClose}
      footer={
        <>
          {onRemove ? (
            <button type="button" className="btn btn-danger" onClick={onRemove}>
              {t('common.delete')}
            </button>
          ) : (
            <button type="button" className="btn btn-outline" onClick={onClose}>
              {t('common.cancel')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(draft)}
            disabled={blockingFlags.length > 0}
          >
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <section className="stack-sm">
          <span className="section-label">{t('form.member.section.identity')}</span>

          <TextField
            label={t('form.member.name')}
            value={draft.name}
            onChange={(value) => update('name', value)}
            autoComplete="off"
            voice
          />

          <ChipSelect
            label={t('form.member.relation')}
            value={draft.relationToHead}
            onChange={(value) => update('relationToHead', value)}
            options={RELATION_OPTIONS}
          />

          <ChipSelect
            label={t('form.member.gender')}
            value={draft.gender}
            onChange={(value) => update('gender', value)}
            options={GENDER_OPTIONS}
            accent
          />

          <div className="input-with-action">
            <div className="grow">
              <NumberField
                label={t('form.member.age')}
                value={draft.age}
                onChange={(value) => update('age', value)}
                min={0}
                max={120}
              />
            </div>
          </div>
        </section>

        <section className="stack-sm">
          <span className="section-label">{t('form.member.section.demographics')}</span>

          <ChipSelect
            label={t('form.member.maritalStatus')}
            value={draft.maritalStatus}
            onChange={(value) => update('maritalStatus', value)}
            options={MARITAL_OPTIONS}
          />

          {isMarried ? (
            <NumberField
              label={t('form.member.ageAtMarriage')}
              value={draft.ageAtMarriage}
              onChange={(value) => update('ageAtMarriage', value)}
              min={0}
              max={120}
              optional
            />
          ) : null}

          <PlainSelectField
            label={t('form.member.religion')}
            value={draft.religion}
            onChange={(value) => update('religion', value)}
            options={religionOptions}
          />

          <ChipSelect
            label={t('form.member.caste')}
            value={draft.casteCategory}
            onChange={(value) => update('casteCategory', value)}
            options={CASTE_OPTIONS}
          />

          <PlainSelectField
            label={t('form.member.motherTongue')}
            value={draft.motherTongue}
            onChange={(value) => update('motherTongue', value)}
            options={tongueOptions}
          />

          <TextField
            label={t('form.member.otherLanguages')}
            value={draft.otherLanguages}
            onChange={(value) => update('otherLanguages', value)}
            optional
            voice
          />

          <SelectField
            label={t('form.member.disability')}
            value={draft.disability}
            onChange={(value) => update('disability', value)}
            options={DISABILITY_OPTIONS}
          />
        </section>

        <section className="stack-sm">
          <span className="section-label">{t('form.member.section.education')}</span>

          <TriToggle
            label={t('form.member.literate')}
            value={draft.literate}
            onChange={(value) => update('literate', value)}
          />

          <SelectField
            label={t('form.member.education')}
            value={draft.education}
            onChange={(value) => update('education', value)}
            options={EDUCATION_OPTIONS}
          />

          <TriToggle
            label={t('form.member.attendingEducation')}
            value={draft.attendingEducation}
            onChange={(value) => update('attendingEducation', value)}
          />
        </section>

        <section className="stack-sm">
          <span className="section-label">{t('form.member.section.work')}</span>

          <SelectField
            label={t('form.member.economicActivity')}
            value={draft.economicActivity}
            onChange={(value) => update('economicActivity', value)}
            options={ECONOMIC_OPTIONS}
          />

          {isWorker ? (
            <>
              <TextField
                label={t('form.member.occupation')}
                value={draft.occupation}
                onChange={(value) => update('occupation', value)}
                voice
              />
              <TextField
                label={t('form.member.industry')}
                value={draft.industry}
                onChange={(value) => update('industry', value)}
                optional
                voice
              />
            </>
          ) : null}
        </section>

        <section className="stack-sm">
          <span className="section-label">{t('form.member.section.migration')}</span>

          <TextField
            label={t('form.member.birthPlace')}
            value={draft.birthPlace}
            onChange={(value) => update('birthPlace', value)}
            optional
            voice
          />
          <TextField
            label={t('form.member.lastResidence')}
            value={draft.lastResidence}
            onChange={(value) => update('lastResidence', value)}
            optional
            voice
          />
          <TextField
            label={t('form.member.migrationReason')}
            value={draft.migrationReason}
            onChange={(value) => update('migrationReason', value)}
            optional
            voice
          />
          <TextField
            label={t('form.member.mobile')}
            value={draft.mobile}
            onChange={(value) => update('mobile', value)}
            type="tel"
            inputMode="numeric"
            maxLength={14}
            optional
          />
        </section>

        {memberFlags.length ? (
          <section className="stack-sm">
            <span className="section-label">{t('validation.title')}</span>
            <FlagList flags={memberFlags} household={household} />
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Spoken-age helper exposed for the form's dictation shortcut. */
export function ageFromSpeech(text: string): number | null {
  const value = parseSpokenNumber(text);
  if (value === null) return null;
  return value >= 0 && value <= 120 ? value : null;
}
