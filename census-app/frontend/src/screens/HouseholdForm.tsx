/** The census schedule: a four-step wizard that saves to the device on every
 * change, so a dead battery or a closed tab never loses an interview. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Stat } from '../components/Charts';
import {
  ChipSelect,
  FormSection,
  MultiChipSelect,
  NumberField,
  PlainSelectField,
  SelectField,
  TextAreaField,
  TextField,
  TriToggle,
} from '../components/Fields';
import { FlagList, FlagSummaryChips } from '../components/FlagList';
import {
  CameraIcon,
  ChevronLeft,
  ChevronRight,
  LocationIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
} from '../components/Icons';
import { AppShell, Banner, EmptyState } from '../components/Layout';
import { MemberEditor } from '../components/MemberEditor';
import { ConfirmSheet } from '../components/Sheet';
import * as api from '../lib/api';
import { capturePosition, formatCoordinate, geoErrorKey, GeoError } from '../lib/geo';
import { blankMember } from '../lib/household';
import {
  ASSET_OPTIONS,
  BUILDING_OPTIONS,
  DRAINAGE_OPTIONS,
  FUEL_OPTIONS,
  INDIAN_STATES,
  LIGHTING_OPTIONS,
  OWNERSHIP_OPTIONS,
  TOILET_OPTIONS,
  WATER_OPTIONS,
} from '../lib/options';
import { fileToPhoto } from '../lib/photo';
import { useApp } from '../lib/store';
import type { Household, Member, ValidationFlag } from '../lib/types';
import { canSubmit, completionPercent, summariseFlags, validateHousehold } from '../lib/validation';
import { deepClone, formatDateTime } from '../lib/utils';

const STEPS = ['location', 'housing', 'members', 'review'] as const;
type Step = (typeof STEPS)[number];

export function HouseholdFormScreen(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    t,
    locale,
    session,
    households,
    saveHousehold,
    submitHousehold,
    deleteHousehold,
    backend,
    toast,
    zones,
  } = useApp();

  const stored = households.find((household) => household.id === id);

  const [draft, setDraft] = useState<Household | null>(() => (stored ? deepClone(stored) : null));
  const [step, setStep] = useState<Step>('location');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isNewMember, setIsNewMember] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<Member | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [aiIssues, setAiIssues] = useState<api.AiValidationIssue[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const dirtyRef = useRef(false);
  // Mirrors `draft` so edits compose correctly without doing work inside a
  // state updater — React may call an updater more than once, or discard the
  // render entirely, so scheduling a save from in there is not safe.
  const draftRef = useRef<Household | null>(draft);

  // Adopt the stored record once it appears (e.g. straight after creation).
  useEffect(() => {
    if (!draft && stored) {
      const adopted = deepClone(stored);
      draftRef.current = adopted;
      setDraft(adopted);
    }
  }, [draft, stored]);

  const persist = useCallback(
    async (next: Household) => {
      try {
        await saveHousehold(next);
        dirtyRef.current = false;
      } catch (error) {
        console.error('census: autosave failed', error);
        toast(t('common.error'), 'error');
      }
    },
    [saveHousehold, t, toast],
  );

  /** Update the draft and schedule a debounced save. */
  const update = useCallback(
    (mutate: (current: Household) => Household) => {
      const current = draftRef.current;
      if (!current) return;

      const next = mutate(current);
      draftRef.current = next;
      dirtyRef.current = true;
      setDraft(next);

      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void persist(next), 700);
    },
    [persist],
  );

  // Flush any pending save when leaving the screen.
  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  // Flush a pending save if the tab is hidden or closed mid-interview.
  useEffect(() => {
    const flush = () => {
      const pending = draftRef.current;
      if (!dirtyRef.current || !pending) return;
      void persist(pending);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('visibilitychange', flush);
    };
  }, [persist]);

  const flags = useMemo(() => (draft ? validateHousehold(draft) : []), [draft]);
  const summary = useMemo(() => summariseFlags(flags), [flags]);
  const progress = useMemo(() => (draft ? completionPercent(draft) : 0), [draft]);

  const isCitizen = session?.user.role === 'citizen';

  if (!draft) {
    return (
      <AppShell title={t('households.title')} showSync={false}>
        <div className="card">
          <EmptyState
            icon="🔎"
            title={t('error.householdNotFound')}
            action={
              <button type="button" className="btn btn-primary" onClick={() => navigate('/households')}>
                {t('common.back')}
              </button>
            }
          />
        </div>
      </AppShell>
    );
  }

  /* ---------------------------------------------------------------- */
  /* GPS                                                               */
  /* ---------------------------------------------------------------- */

  const captureGps = async () => {
    setGpsBusy(true);
    setGpsError(null);
    try {
      const point = await capturePosition();
      update((current) => ({ ...current, location: point }));
      toast(t('form.gps.captured'), 'success');
    } catch (error) {
      const key = error instanceof GeoError ? geoErrorKey(error.code) : 'form.gps.unavailable';
      setGpsError(t(key));
    } finally {
      setGpsBusy(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Photos                                                            */
  /* ---------------------------------------------------------------- */

  const addPhoto = async (file: File) => {
    try {
      const photo = await fileToPhoto(file);
      update((current) => ({ ...current, photos: [...current.photos, photo] }));
    } catch (error) {
      console.error('census: photo failed', error);
      toast(t('form.photo.tooLarge'), 'error');
    }
  };

  /* ---------------------------------------------------------------- */
  /* Members                                                           */
  /* ---------------------------------------------------------------- */

  const openNewMember = () => {
    const isFirst = draft.members.length === 0;
    setEditingMember(blankMember(isFirst ? { relationToHead: 'head' } : {}));
    setIsNewMember(true);
  };

  const saveMember = (member: Member) => {
    update((current) => {
      const exists = current.members.some((item) => item.id === member.id);
      return {
        ...current,
        members: exists
          ? current.members.map((item) => (item.id === member.id ? member : item))
          : [...current.members, member],
      };
    });
    setEditingMember(null);
    setIsNewMember(false);
    toast(t('form.memberSaved'), 'success');
  };

  const removeMember = (member: Member) => {
    update((current) => ({
      ...current,
      members: current.members.filter((item) => item.id !== member.id),
    }));
    setEditingMember(null);
    setConfirmRemoveMember(null);
  };

  /* ---------------------------------------------------------------- */
  /* Submit                                                            */
  /* ---------------------------------------------------------------- */

  const handleSubmit = async () => {
    if (!canSubmit(flags)) {
      toast(t('form.submitBlocked'), 'error');
      setStep('review');
      return;
    }
    if (isCitizen && !consent) {
      toast(t('form.review.consentRequired'), 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const saved = await submitHousehold(draft);
      const fresh = deepClone(saved);
      draftRef.current = fresh;
      setDraft(fresh);
      dirtyRef.current = false;
      toast(t('form.submitSuccess'), 'success');
      navigate(isCitizen ? '/' : '/households');
    } catch (error) {
      console.error('census: submit failed', error);
      toast(t('common.error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const runAiCheck = async () => {
    if (!backend?.aiEnabled) {
      toast(t('form.review.aiUnavailable'), 'info');
      return;
    }
    setAiBusy(true);
    try {
      const issues = await api.aiValidate(draft);
      setAiIssues(issues);
      if (!issues.length) toast(t('form.review.aiNoIssues'), 'success');
    } catch (error) {
      console.error('census: AI check failed', error);
      toast(t('form.review.aiUnavailable'), 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const stepFlags = (field: string): ValidationFlag[] =>
    flags.filter((flag) => flag.field === field);
  const fieldError = (field: string): string | undefined => {
    const flag = stepFlags(field).find((item) => item.severity === 'error');
    return flag ? t(flag.messageKey, flag.values) : undefined;
  };

  const zoneOptions = zones.map((zone) => ({
    value: zone.id,
    label: `${zone.name} (${zone.code})`,
  }));

  return (
    <AppShell
      title={
        draft.status === 'draft'
          ? t('form.title.new')
          : t('form.title.edit', { number: draft.householdNumber })
      }
      subtitle={draft.householdNumber}
    >
      <div className="stack">
        {/* Progress ------------------------------------------------- */}
        <section className="card stack-sm">
          <div className="row-between">
            <span className="tiny">{t('form.progress', { percent: progress })}</span>
            <FlagSummaryChips flags={flags} />
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="steps">
            {STEPS.map((name, index) => (
              <button
                key={name}
                type="button"
                className={`step-pill${step === name ? ' current' : index < stepIndex ? ' complete' : ''}`}
                onClick={() => setStep(name)}
              >
                <span className="step-index">
                  {index + 1}/{STEPS.length}
                </span>
                {t(`form.step.${name}`)}
              </button>
            ))}
          </div>
        </section>

        {draft.status === 'flagged' && draft.reviews.length ? (
          <Banner kind="warning" icon="⚑" title={t('status.flagged')}>
            {draft.reviews[draft.reviews.length - 1].text}
          </Banner>
        ) : null}

        {/* Step: location ------------------------------------------- */}
        {step === 'location' ? (
          <>
            <FormSection title={t('form.section.address')}>
              <TextField
                label={t('form.houseNumber')}
                value={draft.address.houseNumber}
                error={fieldError('houseNumber')}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    address: { ...current.address, houseNumber: value },
                  }))
                }
                voice
              />
              <TextField
                label={t('form.buildingName')}
                value={draft.address.buildingName}
                optional
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    address: { ...current.address, buildingName: value },
                  }))
                }
                voice
              />
              <TextField
                label={t('form.street')}
                value={draft.address.street}
                optional
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    address: { ...current.address, street: value },
                  }))
                }
                voice
              />
              <div className="field-row">
                <TextField
                  label={t('form.village')}
                  value={draft.address.village}
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      address: { ...current.address, village: value },
                    }))
                  }
                  voice
                />
                <TextField
                  label={t('form.locality')}
                  value={draft.address.locality}
                  optional
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      address: { ...current.address, locality: value },
                    }))
                  }
                  voice
                />
              </div>
              <div className="field-row">
                <TextField
                  label={t('form.tehsil')}
                  value={draft.address.tehsil}
                  optional
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      address: { ...current.address, tehsil: value },
                    }))
                  }
                />
                <TextField
                  label={t('form.district')}
                  value={draft.address.district}
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      address: { ...current.address, district: value },
                    }))
                  }
                />
              </div>
              <div className="field-row">
                <PlainSelectField
                  label={t('form.state')}
                  value={draft.address.state}
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      address: { ...current.address, state: value },
                    }))
                  }
                  options={INDIAN_STATES.map((state) => ({ value: state, label: state }))}
                />
                <TextField
                  label={t('form.pincode')}
                  value={draft.address.pincode}
                  inputMode="numeric"
                  maxLength={6}
                  optional
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      address: { ...current.address, pincode: value.replace(/\D/g, '') },
                    }))
                  }
                />
              </div>
              {zoneOptions.length ? (
                <PlainSelectField
                  label={t('form.zone')}
                  value={draft.zoneId}
                  onChange={(value) => update((current) => ({ ...current, zoneId: value }))}
                  options={zoneOptions}
                  optional
                />
              ) : null}
            </FormSection>

            <FormSection title={t('form.section.location')}>
              {draft.location ? (
                <Banner kind="success" icon="📍" title={t('form.gps.captured')}>
                  <span className="mono">
                    {t('form.gps.coordinates', {
                      lat: formatCoordinate(draft.location.lat),
                      lng: formatCoordinate(draft.location.lng),
                    })}
                  </span>
                  {draft.location.accuracy !== undefined ? (
                    <div className="tiny">
                      {t('form.gps.accuracy', { meters: Math.round(draft.location.accuracy) })}
                    </div>
                  ) : null}
                </Banner>
              ) : (
                <p className="muted">{t('validation.location_missing')}</p>
              )}

              {gpsError ? (
                <Banner kind="error" icon="!">
                  {gpsError}
                </Banner>
              ) : null}

              <button
                type="button"
                className="btn btn-outline btn-block"
                onClick={() => void captureGps()}
                disabled={gpsBusy}
              >
                <LocationIcon />
                {gpsBusy
                  ? t('form.gps.capturing')
                  : draft.location
                    ? t('form.gps.recapture')
                    : t('form.gps.capture')}
              </button>
            </FormSection>

            <FormSection title={t('form.section.photo')}>
              <p className="tiny">{t('form.photo.hint')}</p>
              {draft.photos.length ? (
                <div className="photo-grid">
                  {draft.photos.map((photo) => (
                    <div className="photo-thumb" key={photo.id}>
                      <img src={photo.dataUrl} alt={photo.caption || t('form.section.photo')} />
                      <button
                        type="button"
                        aria-label={t('form.photo.remove')}
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            photos: current.photos.filter((item) => item.id !== photo.id),
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void addPhoto(file);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn btn-outline btn-block"
                onClick={() => photoInputRef.current?.click()}
              >
                <CameraIcon />
                {t('form.photo.add')}
              </button>
            </FormSection>
          </>
        ) : null}

        {/* Step: housing -------------------------------------------- */}
        {step === 'housing' ? (
          <>
            <FormSection title={t('form.section.structure')}>
              <ChipSelect
                label={t('form.buildingType')}
                value={draft.housing.buildingType}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, buildingType: value },
                  }))
                }
                options={BUILDING_OPTIONS}
              />
              <ChipSelect
                label={t('form.ownership')}
                value={draft.housing.ownership}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, ownership: value },
                  }))
                }
                options={OWNERSHIP_OPTIONS}
                accent
              />
              <div className="field-row">
                <NumberField
                  label={t('form.rooms')}
                  value={draft.housing.rooms}
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      housing: { ...current.housing, rooms: value },
                    }))
                  }
                  min={0}
                  max={40}
                />
                <NumberField
                  label={t('form.marriedCouples')}
                  value={draft.housing.marriedCouples}
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      housing: { ...current.housing, marriedCouples: value },
                    }))
                  }
                  min={0}
                  max={30}
                  optional
                />
              </div>
              <TriToggle
                label={t('form.separateKitchen')}
                value={draft.housing.hasSeparateKitchen}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, hasSeparateKitchen: value },
                  }))
                }
              />
              <TriToggle
                label={t('form.bathroom')}
                value={draft.housing.hasBathroom}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, hasBathroom: value },
                  }))
                }
              />
            </FormSection>

            <FormSection title={t('form.section.amenities')}>
              <SelectField
                label={t('form.waterSource')}
                value={draft.housing.waterSource}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, waterSource: value },
                  }))
                }
                options={WATER_OPTIONS}
              />
              <TriToggle
                label={t('form.waterWithinPremises')}
                value={draft.housing.waterWithinPremises}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, waterWithinPremises: value },
                  }))
                }
              />
              <SelectField
                label={t('form.toilet')}
                value={draft.housing.toilet}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, toilet: value },
                  }))
                }
                options={TOILET_OPTIONS}
              />
              <ChipSelect
                label={t('form.drainage')}
                value={draft.housing.drainage}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, drainage: value },
                  }))
                }
                options={DRAINAGE_OPTIONS}
              />
              <SelectField
                label={t('form.lighting')}
                value={draft.housing.lighting}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, lighting: value },
                  }))
                }
                options={LIGHTING_OPTIONS}
              />
              <SelectField
                label={t('form.cookingFuel')}
                value={draft.housing.cookingFuel}
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, cookingFuel: value },
                  }))
                }
                options={FUEL_OPTIONS}
              />
            </FormSection>

            <FormSection title={t('form.section.assets')}>
              <MultiChipSelect
                label={t('form.assetsHint')}
                values={draft.housing.assets}
                onChange={(values) =>
                  update((current) => ({
                    ...current,
                    housing: { ...current.housing, assets: values },
                  }))
                }
                options={ASSET_OPTIONS}
              />
            </FormSection>
          </>
        ) : null}

        {/* Step: members -------------------------------------------- */}
        {step === 'members' ? (
          <FormSection
            title={t('form.section.members')}
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={openNewMember}>
                <PlusIcon />
                {t('form.addMember')}
              </button>
            }
          >
            {draft.members.length ? (
              <div className="list">
                {draft.members.map((member, index) => {
                  const memberFlags = flags.filter((flag) => flag.memberId === member.id);
                  const errors = memberFlags.filter((flag) => flag.severity === 'error').length;
                  return (
                    <button
                      type="button"
                      className="list-item"
                      key={member.id}
                      onClick={() => {
                        setEditingMember(member);
                        setIsNewMember(false);
                      }}
                    >
                      <div className="row-between">
                        <span className="title">
                          {member.name.trim() || t('form.memberNumber', { index: index + 1 })}
                        </span>
                        {member.relationToHead ? (
                          <span className="badge badge-draft">
                            {t(`opt.relation.${member.relationToHead}`)}
                          </span>
                        ) : null}
                      </div>
                      <div className="meta row-wrap" style={{ gap: 6 }}>
                        {member.gender ? <span>{t(`opt.gender.${member.gender}`)}</span> : null}
                        {member.age !== null ? <span>· {member.age}</span> : null}
                        {member.education ? (
                          <span>· {t(`opt.education.${member.education}`)}</span>
                        ) : null}
                        {errors > 0 ? (
                          <span className="badge badge-flagged">
                            {t('form.review.errors', { count: errors })}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon="👨‍👩‍👧"
                title={t('form.noMembers')}
                hint={t('form.noMembersHint')}
                action={
                  <button type="button" className="btn btn-primary" onClick={openNewMember}>
                    <PlusIcon />
                    {t('form.addMember')}
                  </button>
                }
              />
            )}
          </FormSection>
        ) : null}

        {/* Step: review --------------------------------------------- */}
        {step === 'review' ? (
          <>
            <FormSection title={t('form.review.summary')}>
              <div className="stat-grid">
                <Stat value={draft.members.length} label={t('analytics.members')} tone="navy" />
                <Stat
                  value={draft.housing.rooms ?? 0}
                  label={t('form.rooms')}
                  tone="accent"
                />
                <Stat
                  value={draft.location ? '✓' : '—'}
                  label={t('form.section.location')}
                  tone={draft.location ? 'green' : 'danger'}
                />
                <Stat value={draft.photos.length} label={t('form.section.photo')} />
              </div>
              <p className="tiny">
                {t('sync.lastSync', { time: formatDateTime(draft.updatedAt, locale) })}
              </p>
            </FormSection>

            <FormSection
              title={t('form.review.checks')}
              action={
                backend?.aiEnabled ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => void runAiCheck()}
                    disabled={aiBusy}
                  >
                    <SparkleIcon />
                    {aiBusy ? t('form.review.aiChecking') : t('form.review.runAiCheck')}
                  </button>
                ) : undefined
              }
            >
              {flags.length ? (
                <FlagList flags={flags} household={draft} />
              ) : (
                <Banner kind="success" icon="✓">
                  {t('form.review.noIssues')}
                </Banner>
              )}

              {aiIssues && aiIssues.length ? (
                <div className="stack-sm">
                  <span className="section-label">{t('ai.assist')}</span>
                  <div className="flag-list">
                    {aiIssues.map((issue, index) => (
                      <div className={`flag ${issue.severity}`} key={`${issue.field ?? ''}-${index}`}>
                        <div>{issue.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </FormSection>

            <FormSection title={t('form.notes')}>
              <TextAreaField
                label={t('form.notes')}
                value={draft.notes}
                optional
                placeholder={t('form.notesPlaceholder')}
                onChange={(value) => update((current) => ({ ...current, notes: value }))}
                voice
              />
            </FormSection>

            {isCitizen ? (
              <label className="card row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  style={{ width: 24, height: 24, marginTop: 2, flex: 'none' }}
                />
                <span style={{ fontSize: '0.9rem' }}>{t('form.review.consent')}</span>
              </label>
            ) : null}

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => void handleSubmit()}
              disabled={submitting || summary.errors > 0 || (isCitizen && !consent)}
            >
              {submitting
                ? t('common.loading')
                : isCitizen
                  ? t('form.review.submitAsCitizen')
                  : t('common.submit')}
            </button>

            {summary.errors > 0 ? (
              <p className="tiny text-center" style={{ color: 'var(--danger)' }}>
                {t('form.submitBlocked')}
              </p>
            ) : null}

            {draft.status === 'draft' ? (
              <button
                type="button"
                className="btn btn-danger btn-block"
                onClick={() => setConfirmDelete(true)}
              >
                <TrashIcon />
                {t('common.delete')}
              </button>
            ) : null}
          </>
        ) : null}

        {/* Step navigation ------------------------------------------ */}
        <div className="row" style={{ gap: 10 }}>
          <button
            type="button"
            className="btn btn-outline grow"
            disabled={stepIndex === 0}
            onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)])}
          >
            <ChevronLeft />
            {t('common.back')}
          </button>
          <button
            type="button"
            className="btn btn-primary grow"
            disabled={stepIndex === STEPS.length - 1}
            onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)])}
          >
            {t('common.next')}
            <ChevronRight />
          </button>
        </div>
      </div>

      {editingMember ? (
        <MemberEditor
          member={editingMember}
          household={draft}
          onSave={saveMember}
          onClose={() => {
            setEditingMember(null);
            setIsNewMember(false);
          }}
          onRemove={
            isNewMember
              ? undefined
              : () => setConfirmRemoveMember(editingMember)
          }
        />
      ) : null}

      {confirmRemoveMember ? (
        <ConfirmSheet
          title={t('form.removeMember')}
          message={t('form.removeMemberConfirm', {
            name: confirmRemoveMember.name || t('common.unknown'),
          })}
          danger
          confirmLabel={t('common.delete')}
          onCancel={() => setConfirmRemoveMember(null)}
          onConfirm={() => removeMember(confirmRemoveMember)}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmSheet
          title={t('common.delete')}
          message={t('households.deleteConfirm')}
          danger
          confirmLabel={t('common.delete')}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void deleteHousehold(draft.id).then(() => navigate('/households'));
          }}
        />
      ) : null}
    </AppShell>
  );
}
