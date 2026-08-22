/** Profile: language, account, server connection, storage and backups. */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DownloadIcon, LogoutIcon, SyncIcon, UploadIcon } from '../components/Icons';
import { AppShell, Banner } from '../components/Layout';
import { ConfirmSheet } from '../components/Sheet';
import { LANGUAGES } from '../i18n';
import * as api from '../lib/api';
import { storageEstimate, storageKind } from '../lib/db';
import { makeBackup, parseBackup } from '../lib/household';
import { useInstallPrompt } from '../lib/install';
import { formatBytes } from '../lib/photo';
import { APP_VERSION, useApp } from '../lib/store';
import type { LanguageCode } from '../lib/types';
import { downloadText, formatDateTime, relativeTime, todayKey } from '../lib/utils';

export function ProfileScreen(): JSX.Element {
  const {
    t,
    locale,
    language,
    setLanguage,
    session,
    signOut,
    households,
    zones,
    pendingCount,
    lastSyncAt,
    syncNow,
    syncing,
    deviceOnly,
    backend,
    checkBackend,
    clearLocalData,
    importHouseholds,
    toast,
  } = useApp();
  const navigate = useNavigate();
  const install = useInstallPrompt();

  const [apiBase, setApiBase] = useState(() => api.getApiBase());
  const [checking, setChecking] = useState(false);
  const [engine, setEngine] = useState<string>('—');
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [kind, estimate] = await Promise.all([storageKind(), storageEstimate()]);
      if (cancelled) return;
      setEngine(kind === 'indexeddb' ? 'IndexedDB' : 'localStorage');
      setUsage(estimate);
    })();
    return () => {
      cancelled = true;
    };
  }, [households.length]);

  const zone = zones.find((candidate) => session?.user.zoneIds.includes(candidate.id));

  const saveServer = async () => {
    setChecking(true);
    try {
      api.setApiBase(apiBase.trim() ? apiBase.trim() : null);
      const health = await checkBackend();
      if (health) {
        toast(t('profile.apiConnected', { database: health.database }), 'success');
      } else {
        toast(t('profile.apiOffline'), 'error');
      }
    } finally {
      setChecking(false);
    }
  };

  const exportBackup = () => {
    const backup = makeBackup(households);
    downloadText(
      `census-backup-${todayKey()}.json`,
      JSON.stringify(backup, null, 2),
      'application/json',
    );
  };

  const importBackup = async (file: File) => {
    try {
      const text = await file.text();
      const restored = parseBackup(text);
      const count = await importHouseholds(restored);
      toast(t('profile.importSuccess', { count }), 'success');
    } catch (error) {
      console.error('census: import failed', error);
      toast(t('profile.importFailed'), 'error');
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <AppShell title={t('profile.title')} subtitle={session?.user.name}>
      <div className="stack">
        {/* Account -------------------------------------------------- */}
        <section className="card stack-sm">
          <span className="section-label">{t('profile.account')}</span>
          <InfoRow label={t('login.name')} value={session?.user.name || '—'} />
          <InfoRow label={t('profile.role')} value={t(`role.${session?.user.role ?? 'enumerator'}`)} />
          <InfoRow label={t('profile.mobile')} value={session?.user.mobile || '—'} />
          {session?.user.employeeCode ? (
            <InfoRow label={t('profile.employeeCode')} value={session.user.employeeCode} />
          ) : null}
          <InfoRow
            label={t('profile.zone')}
            value={zone ? `${zone.name} (${zone.code})` : t('home.noZone')}
          />
        </section>

        {/* Language ------------------------------------------------- */}
        <section className="card stack-sm">
          <span className="section-label">{t('profile.language')}</span>
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

        {/* Sync ----------------------------------------------------- */}
        <section className="card stack-sm">
          <span className="section-label">{t('profile.dataSync')}</span>
          <InfoRow label={t('home.stats.total')} value={String(households.length)} />
          <InfoRow label={t('home.stats.pendingSync')} value={String(pendingCount)} />
          <InfoRow
            label={t('sync.lastSync', { time: '' }).replace(/\s*$/, '')}
            value={lastSyncAt ? relativeTime(lastSyncAt) : t('sync.never')}
          />
          <button
            type="button"
            className="btn btn-outline btn-block"
            onClick={() => void syncNow()}
            disabled={deviceOnly || syncing}
          >
            <SyncIcon />
            {syncing ? t('sync.syncing') : t('home.syncNow')}
          </button>
        </section>

        {/* Server --------------------------------------------------- */}
        <section className="card stack-sm">
          <span className="section-label">{t('profile.server')}</span>
          {backend ? (
            <Banner kind="success" icon="✓">
              {t('profile.apiConnected', { database: backend.database })}
            </Banner>
          ) : (
            <Banner kind="warning" icon="📴">
              {t('profile.apiOffline')}
            </Banner>
          )}

          <div className="field">
            <label className="field-label" htmlFor="api-base">
              {t('profile.apiBase')}
            </label>
            <input
              id="api-base"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={apiBase}
              placeholder="https://census.example.in"
              onChange={(event) => setApiBase(event.target.value)}
            />
            <span className="hint">{t('profile.apiBaseHint')}</span>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-block"
            onClick={() => void saveServer()}
            disabled={checking}
          >
            {checking ? t('profile.apiChecking') : t('profile.testConnection')}
          </button>

          {backend ? (
            <p className="tiny">
              {backend.smsEnabled ? '✓' : '—'} SMS · {backend.aiEnabled ? '✓' : '—'} AI ·{' '}
              {backend.database} · v{backend.version}
            </p>
          ) : null}
        </section>

        {/* Storage & backup ----------------------------------------- */}
        <section className="card stack-sm">
          <span className="section-label">{t('profile.storage')}</span>
          <p className="tiny">{t('profile.storageEngine', { engine })}</p>
          {usage ? (
            <p className="tiny">
              {t('profile.storageUsed', {
                used: formatBytes(usage.usage),
                quota: formatBytes(usage.quota),
              })}
            </p>
          ) : null}

          <button type="button" className="btn btn-outline btn-block" onClick={exportBackup}>
            <DownloadIcon />
            {t('profile.exportBackup')}
          </button>
          <p className="tiny">{t('profile.exportBackupHint')}</p>

          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-outline btn-block"
            onClick={() => importRef.current?.click()}
          >
            <UploadIcon />
            {t('profile.importBackup')}
          </button>

          <button
            type="button"
            className="btn btn-danger btn-block"
            onClick={() => setConfirmClear(true)}
          >
            {t('profile.clearData')}
          </button>
        </section>

        {/* Install -------------------------------------------------- */}
        <section className="card stack-sm">
          <span className="section-label">{t('profile.install')}</span>
          {install.installed ? (
            <Banner kind="success" icon="✓">
              {t('profile.installed')}
            </Banner>
          ) : (
            <>
              <p className="tiny">{t('profile.installHint')}</p>
              <button
                type="button"
                className="btn btn-accent btn-block"
                onClick={() => {
                  void install.promptInstall().then((outcome) => {
                    if (outcome === 'unavailable') toast(t('profile.installUnavailable'), 'info');
                  });
                }}
              >
                <DownloadIcon />
                {t('profile.install')}
              </button>
            </>
          )}
        </section>

        {/* About ---------------------------------------------------- */}
        <section className="card stack-sm">
          <span className="section-label">{t('profile.about')}</span>
          <p className="tiny">{t('profile.version', { version: APP_VERSION })}</p>
          <p className="tiny">{t('app.govt')}</p>
          <p className="tiny">{t('login.terms')}</p>
          {session ? (
            <p className="tiny">
              {t('common.today')}: {formatDateTime(session.issuedAt, locale)}
            </p>
          ) : null}
        </section>

        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() => setConfirmLogout(true)}
        >
          <LogoutIcon />
          {t('profile.logout')}
        </button>
      </div>

      {confirmClear ? (
        <ConfirmSheet
          title={t('profile.clearData')}
          message={t('profile.clearDataConfirm')}
          danger
          confirmLabel={t('common.delete')}
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            void clearLocalData().then(() => {
              toast(t('profile.cleared'), 'success');
              setConfirmClear(false);
            });
          }}
        />
      ) : null}

      {confirmLogout ? (
        <ConfirmSheet
          title={t('profile.logout')}
          message={
            pendingCount > 0
              ? `${t('profile.logoutConfirm')} ${t('profile.logoutUnsynced', { count: pendingCount })}`
              : t('profile.logoutConfirm')
          }
          confirmLabel={t('profile.logout')}
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => void handleLogout()}
        />
      ) : null}
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="row-between" style={{ alignItems: 'baseline' }}>
      <span className="tiny">{label}</span>
      <span style={{ fontWeight: 600, fontSize: '0.9rem', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
