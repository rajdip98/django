/** Form controls sized for field use: 48px targets, chips instead of tiny
 * radios, and optional voice dictation on free-text inputs. */

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { MicIcon } from './Icons';
import { useApp } from '../lib/store';
import { useSpeechRecognition } from '../lib/voice';
import type { Option } from '../lib/options';

interface BaseProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
}

function FieldLabel({
  htmlFor,
  label,
  optional,
  optionalText,
}: {
  htmlFor: string;
  label: string;
  optional?: boolean;
  optionalText: string;
}): JSX.Element {
  return (
    <label className="field-label" htmlFor={htmlFor}>
      {label}
      {optional ? <span className="optional">({optionalText})</span> : null}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Voice dictation button                                              */
/* ------------------------------------------------------------------ */

export function VoiceButton({
  onResult,
  ariaLabel,
}: {
  onResult: (text: string) => void;
  ariaLabel?: string;
}): JSX.Element | null {
  const { locale, t, toast } = useApp();
  const voice = useSpeechRecognition(locale, onResult);
  const reportedRef = useRef<string | null>(null);

  // Report each recognition failure once, after render — never during it.
  useEffect(() => {
    if (voice.listening) {
      reportedRef.current = null;
      return;
    }
    if (voice.errorKey && reportedRef.current !== voice.errorKey) {
      reportedRef.current = voice.errorKey;
      toast(t(voice.errorKey), 'error');
    }
  }, [t, toast, voice.errorKey, voice.listening]);

  if (!voice.supported) return null;

  const handleClick = () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    voice.start();
  };

  return (
    <button
      type="button"
      className={`mic-btn${voice.listening ? ' listening' : ''}`}
      onClick={handleClick}
      aria-label={ariaLabel ?? t(voice.listening ? 'voice.stop' : 'voice.start')}
      title={voice.listening ? t('voice.listening') : t('voice.start')}
    >
      <MicIcon />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  optional,
  placeholder,
  type = 'text',
  inputMode,
  maxLength,
  autoComplete,
  voice = false,
  disabled = false,
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'tel' | 'password' | 'url' | 'email';
  inputMode?: 'text' | 'numeric' | 'tel' | 'decimal' | 'url' | 'email';
  maxLength?: number;
  autoComplete?: string;
  voice?: boolean;
  disabled?: boolean;
}): JSX.Element {
  const id = useId();
  const { t } = useApp();

  const input = (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      maxLength={maxLength}
      autoComplete={autoComplete}
      disabled={disabled}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );

  return (
    <div className="field">
      <FieldLabel htmlFor={id} label={label} optional={optional} optionalText={t('common.optional')} />
      {voice ? (
        <div className="input-with-action">
          {input}
          <VoiceButton
            onResult={(text) => onChange(value ? `${value} ${text}`.trim() : text)}
            ariaLabel={`${t('voice.start')}: ${label}`}
          />
        </div>
      ) : (
        input
      )}
      {hint && !error ? (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="error-text" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
  optional,
  placeholder,
  rows = 3,
  voice = false,
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  voice?: boolean;
}): JSX.Element {
  const id = useId();
  const { t } = useApp();

  return (
    <div className="field">
      <FieldLabel htmlFor={id} label={label} optional={optional} optionalText={t('common.optional')} />
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {hint ? <span className="hint">{hint}</span> : <span />}
        {voice ? (
          <VoiceButton onResult={(text) => onChange(value ? `${value} ${text}`.trim() : text)} />
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Number                                                              */
/* ------------------------------------------------------------------ */

export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
  optional,
  min = 0,
  max = 999,
  placeholder,
}: BaseProps & {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}): JSX.Element {
  const id = useId();
  const { t } = useApp();

  return (
    <div className="field">
      <FieldLabel htmlFor={id} label={label} optional={optional} optionalText={t('common.optional')} />
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value === null || value === undefined ? '' : String(value)}
        min={min}
        max={max}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') {
            onChange(null);
            return;
          }
          const parsed = Number.parseInt(raw, 10);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
      />
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Select                                                              */
/* ------------------------------------------------------------------ */

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  optional,
  placeholderKey = 'common.select',
}: BaseProps & {
  value: T | '';
  onChange: (value: T | '') => void;
  options: Option<T>[];
  placeholderKey?: string;
}): JSX.Element {
  const id = useId();
  const { t } = useApp();

  return (
    <div className="field">
      <FieldLabel htmlFor={id} label={label} optional={optional} optionalText={t('common.optional')} />
      <select
        id={id}
        value={value}
        aria-invalid={error ? 'true' : undefined}
        onChange={(event) => onChange(event.target.value as T | '')}
      >
        <option value="">{t(placeholderKey)}…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.key)}
          </option>
        ))}
      </select>
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}

/** Plain string select for values that are not part of a translated option set. */
export function PlainSelectField({
  label,
  value,
  onChange,
  options,
  hint,
  optional,
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}): JSX.Element {
  const id = useId();
  const { t } = useApp();

  return (
    <div className="field">
      <FieldLabel htmlFor={id} label={label} optional={optional} optionalText={t('common.optional')} />
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t('common.select')}…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

export function ChipSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  optional,
  accent = false,
}: BaseProps & {
  value: T | '';
  onChange: (value: T | '') => void;
  options: Option<T>[];
  accent?: boolean;
}): JSX.Element {
  const { t } = useApp();

  return (
    <div className="field">
      <span className="field-label">
        {label}
        {optional ? <span className="optional">({t('common.optional')})</span> : null}
      </span>
      <div className="chip-group" role="group" aria-label={label}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`chip${selected ? ' selected' : ''}${accent ? ' accent' : ''}`}
              aria-pressed={selected}
              onClick={() => onChange(selected ? '' : option.value)}
            >
              {t(option.key)}
            </button>
          );
        })}
      </div>
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}

export function MultiChipSelect({
  label,
  values,
  onChange,
  options,
  hint,
  optional,
}: BaseProps & {
  values: string[];
  onChange: (values: string[]) => void;
  options: Option[];
}): JSX.Element {
  const { t } = useApp();

  const toggle = (value: string) => {
    onChange(
      values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
    );
  };

  return (
    <div className="field">
      <span className="field-label">
        {label}
        {optional ? <span className="optional">({t('common.optional')})</span> : null}
      </span>
      <div className="chip-group" role="group" aria-label={label}>
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={`chip${selected ? ' selected' : ''}`}
              aria-pressed={selected}
              onClick={() => toggle(option.value)}
            >
              {selected ? '✓ ' : ''}
              {t(option.key)}
            </button>
          );
        })}
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Yes / no / not recorded                                             */
/* ------------------------------------------------------------------ */

export function TriToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}): JSX.Element {
  const { t } = useApp();

  return (
    <div className="switch-row">
      <span id={`tri-${label}`}>{label}</span>
      <div className="tri-toggle" role="group" aria-labelledby={`tri-${label}`}>
        <button
          type="button"
          className={value === true ? 'on' : ''}
          aria-pressed={value === true}
          onClick={() => onChange(value === true ? null : true)}
        >
          {t('common.yes')}
        </button>
        <button
          type="button"
          className={value === false ? 'off' : ''}
          aria-pressed={value === false}
          onClick={() => onChange(value === false ? null : false)}
        >
          {t('common.no')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout helper                                                       */
/* ------------------------------------------------------------------ */

export function FormSection({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  return (
    <section className="card stack">
      <div className="row-between">
        <h2 className="section-label" style={{ marginBottom: 0 }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
