/** Sign-in: OTP for the four field roles, password for administrators.
 *
 * Works in three situations:
 *   1. Backend with SMS configured  → a real OTP arrives by text message.
 *   2. Backend without SMS          → the server returns the code so the flow
 *                                     can still be exercised (development).
 *   3. No backend at all            → device-only mode, no OTP round trip.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { Banner } from '../components/Layout';
import { LANGUAGES } from '../i18n';
import * as api from '../lib/api';
import { digestsMatch, sha256Hex } from '../lib/hash';
import {
  ADMIN_HASH_SALT,
  ADMIN_PASSWORD_DIGEST,
  localSession,
  useApp,
} from '../lib/store';
import type { LanguageCode, Role, Session } from '../lib/types';
import { isValidMobile, normaliseMobile, nowIso } from '../lib/utils';

const FIELD_ROLES: Role[] = ['enumerator', 'citizen', 'supervisor'];
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

type Stage = 'identity' | 'otp';
type Tab = 'otp' | 'admin';

export function LoginScreen(): JSX.Element {
  const {
    t,
    language,
    setLanguage,
    signIn,
    backend,
    backendChecked,
    checkBackend,
    toast,
  } = useApp();

  const [tab, setTab] = useState<Tab>('otp');
  const [stage, setStage] = useState<Stage>('identity');
  const [role, setRole] = useState<Role>('enumerator');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [digits, setDigits] = useState<string[]>(() => Array<string>(OTP_LENGTH).fill(''));
  const [challenge, setChallenge] = useState<api.OtpChallenge | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const deviceOnly = backendChecked && !backend;
  const otp = digits.join('');

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (stage === 'otp') otpRefs.current[0]?.focus();
  }, [stage]);

  const roleOptions = useMemo(
    () =>
      FIELD_ROLES.map((value) => ({
        value,
        name: t(`role.${value}`),
        description: t(`role.${value}.desc`),
      })),
    [t],
  );

  /* ---------------------------------------------------------------- */
  /* OTP flow                                                          */
  /* ---------------------------------------------------------------- */

  const requestOtp = async () => {
    setError(null);

    if (!isValidMobile(mobile)) {
      setError(t('login.invalidMobile'));
      return;
    }
    if (!name.trim()) {
      setError(t('login.nameRequired'));
      return;
    }

    // The backend may have come up (or gone away) since the app launched.
    const health = backendChecked ? backend : await checkBackend();

    if (!health) {
      await signIn(localSession(name.trim(), normaliseMobile(mobile), role));
      return;
    }

    setBusy(true);
    try {
      const result = await api.requestOtp(normaliseMobile(mobile), role);
      setChallenge(result);
      setDigits(Array<string>(OTP_LENGTH).fill(''));
      setStage('otp');
      setResendIn(RESEND_SECONDS);
      if (result.devOtp) toast(t('login.devOtp', { otp: result.devOtp }), 'info');
    } catch (caught) {
      if (caught instanceof api.OfflineError) {
        // Server disappeared mid-flow — fall back rather than blocking the user.
        await checkBackend();
        await signIn(localSession(name.trim(), normaliseMobile(mobile), role));
        return;
      }
      setError(caught instanceof Error ? caught.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    if (otp.length !== OTP_LENGTH) {
      setError(t('login.invalidOtp'));
      return;
    }
    if (!challenge) {
      setStage('identity');
      return;
    }

    setBusy(true);
    try {
      const result = await api.verifyOtp({
        requestId: challenge.requestId,
        mobile: normaliseMobile(mobile),
        otp,
        name: name.trim(),
        role,
      });
      const session: Session = {
        token: result.token,
        user: result.user,
        local: false,
        issuedAt: nowIso(),
      };
      await signIn(session);
    } catch (caught) {
      if (caught instanceof api.ApiError && caught.status === 410) {
        setError(t('login.otpExpired'));
      } else if (caught instanceof api.OfflineError) {
        setError(t('sync.offline'));
      } else {
        setError(caught instanceof Error ? caught.message : t('login.invalidOtp'));
      }
      setDigits(Array<string>(OTP_LENGTH).fill(''));
      otpRefs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');

    if (cleaned.length > 1) {
      // Pasted or autofilled code — spread it across the boxes.
      const next = Array<string>(OTP_LENGTH).fill('');
      for (let i = 0; i < OTP_LENGTH; i += 1) next[i] = cleaned[i] ?? '';
      setDigits(next);
      otpRefs.current[Math.min(cleaned.length, OTP_LENGTH - 1)]?.focus();
      return;
    }

    setDigits((current) => {
      const next = current.slice();
      next[index] = cleaned;
      return next;
    });
    if (cleaned && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  const onOtpKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) otpRefs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  /* ---------------------------------------------------------------- */
  /* Admin flow                                                        */
  /* ---------------------------------------------------------------- */

  const adminLogin = async () => {
    setError(null);
    if (!password) {
      setError(t('login.wrongPassword'));
      return;
    }

    const health = backendChecked ? backend : await checkBackend();
    setBusy(true);

    try {
      if (health) {
        const result = await api.adminLogin(password);
        await signIn({
          token: result.token,
          user: result.user,
          local: false,
          issuedAt: nowIso(),
        });
        return;
      }

      // Device-only: compare against the salted digest baked into the bundle.
      if (digestsMatch(sha256Hex(`${ADMIN_HASH_SALT}:${password}`), ADMIN_PASSWORD_DIGEST)) {
        const session = localSession('Administrator', '', 'admin');
        await signIn(session);
        return;
      }
      setError(t('login.wrongPassword'));
    } catch (caught) {
      if (caught instanceof api.ApiError && caught.status === 401) {
        setError(t('login.wrongPassword'));
      } else if (caught instanceof api.OfflineError) {
        setError(t('sync.offline'));
      } else {
        setError(caught instanceof Error ? caught.message : t('common.error'));
      }
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="login-page">
      <div className="login-hero">
        <img src="./icons/icon.svg" alt="" className="emblem" width={64} height={64} />
        <h1>{t('app.title')}</h1>
        <p>{t('app.tagline')}</p>
      </div>

      <div className="login-body">
        <section className="stack-sm">
          <span className="section-label">{t('login.chooseLanguage')}</span>
          <div className="language-grid">
            {LANGUAGES.map((option) => (
              <button
                key={option.code}
                type="button"
                className={`language-card${language === option.code ? ' selected' : ''}`}
                aria-pressed={language === option.code}
                onClick={() => setLanguage(option.code as LanguageCode)}
              >
                <span className="native">{option.nativeName}</span>
                <span className="english">{option.englishName}</span>
              </button>
            ))}
          </div>
        </section>

        {deviceOnly ? (
          <Banner kind="warning" icon="⚠" title={t('login.offlineTitle')}>
            {t('login.offlineNotice')}
          </Banner>
        ) : null}

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'otp'}
            className={`tab${tab === 'otp' ? ' active' : ''}`}
            onClick={() => {
              setTab('otp');
              setError(null);
            }}
          >
            {t('login.otpTab')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'admin'}
            className={`tab${tab === 'admin' ? ' active' : ''}`}
            onClick={() => {
              setTab('admin');
              setError(null);
            }}
          >
            {t('login.adminTab')}
          </button>
        </div>

        {error ? (
          <Banner kind="error" icon="!">
            {error}
          </Banner>
        ) : null}

        {tab === 'otp' ? (
          stage === 'identity' ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void requestOtp();
              }}
            >
              <section className="stack-sm">
                <span className="section-label">{t('login.selectRole')}</span>
                <div className="role-grid">
                  {roleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`role-card${role === option.value ? ' selected' : ''}`}
                      aria-pressed={role === option.value}
                      onClick={() => setRole(option.value)}
                    >
                      <span className="role-name">{option.name}</span>
                      <span className="role-desc">{option.description}</span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="field">
                <label className="field-label" htmlFor="login-name">
                  {t('login.name')}
                </label>
                <input
                  id="login-name"
                  value={name}
                  autoComplete="name"
                  placeholder={t('login.namePlaceholder')}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="login-mobile">
                  {t('login.mobile')}
                </label>
                <input
                  id="login-mobile"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={14}
                  value={mobile}
                  placeholder={t('login.mobilePlaceholder')}
                  onChange={(event) => setMobile(event.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy
                  ? t('common.loading')
                  : deviceOnly
                    ? t('login.offlineContinue')
                    : t('login.sendOtp')}
              </button>
            </form>
          ) : (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void verifyOtp();
              }}
            >
              <p className="muted">{t('login.otpSent', { mobile: normaliseMobile(mobile) })}</p>

              {challenge?.devOtp ? (
                <Banner kind="info" icon="🔑">
                  {t('login.devOtp', { otp: challenge.devOtp })}
                </Banner>
              ) : null}

              <div className="field">
                <span className="field-label">{t('login.enterOtp')}</span>
                <div className="otp-inputs">
                  {digits.map((digit, index) => (
                    <input
                      // Fixed-length array of positional boxes — index is the identity.
                      // eslint-disable-next-line react/no-array-index-key
                      key={index}
                      ref={(element) => {
                        otpRefs.current[index] = element;
                      }}
                      value={digit}
                      inputMode="numeric"
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      maxLength={OTP_LENGTH}
                      aria-label={`${t('login.enterOtp')} ${index + 1}`}
                      onChange={(event) => setDigit(index, event.target.value)}
                      onKeyDown={(event) => onOtpKeyDown(index, event)}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={busy || otp.length !== OTP_LENGTH}
              >
                {busy ? t('common.loading') : t('login.verify')}
              </button>

              <div className="row-between">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setStage('identity');
                    setError(null);
                  }}
                >
                  {t('login.changeNumber')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={resendIn > 0 || busy}
                  onClick={() => void requestOtp()}
                >
                  {resendIn > 0 ? t('login.resendIn', { seconds: resendIn }) : t('login.resend')}
                </button>
              </div>

              <p className="tiny text-center">{t('login.securityNote')}</p>
            </form>
          )
        ) : (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void adminLogin();
            }}
          >
            <div className="field">
              <label className="field-label" htmlFor="admin-password">
                {t('login.adminPassword')}
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? t('common.loading') : t('login.adminLogin')}
            </button>
          </form>
        )}

        <p className="tiny text-center">{t('login.terms')}</p>
        <p className="tiny text-center">{t('app.govt')}</p>
      </div>
    </div>
  );
}
