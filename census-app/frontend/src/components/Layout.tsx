/** App shell: header, bottom navigation, toasts. */

import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

import {
  DashboardIcon,
  HomeIcon,
  HouseholdsIcon,
  MapIcon,
  ProfileIcon,
  ShieldIcon,
  SyncIcon,
} from './Icons';
import { useApp } from '../lib/store';
import type { Role } from '../lib/types';
import { relativeTime } from '../lib/utils';

interface NavItem {
  to: string;
  labelKey: string;
  icon: (props: { className?: string }) => JSX.Element;
}

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  enumerator: [
    { to: '/', labelKey: 'nav.home', icon: HomeIcon },
    { to: '/households', labelKey: 'nav.households', icon: HouseholdsIcon },
    { to: '/map', labelKey: 'nav.map', icon: MapIcon },
    { to: '/profile', labelKey: 'nav.profile', icon: ProfileIcon },
  ],
  citizen: [
    { to: '/', labelKey: 'nav.home', icon: HomeIcon },
    { to: '/households', labelKey: 'nav.households', icon: HouseholdsIcon },
    { to: '/profile', labelKey: 'nav.profile', icon: ProfileIcon },
  ],
  supervisor: [
    { to: '/', labelKey: 'nav.home', icon: HomeIcon },
    { to: '/households', labelKey: 'nav.households', icon: HouseholdsIcon },
    { to: '/map', labelKey: 'nav.map', icon: MapIcon },
    { to: '/supervisor', labelKey: 'nav.dashboard', icon: DashboardIcon },
    { to: '/profile', labelKey: 'nav.profile', icon: ProfileIcon },
  ],
  admin: [
    { to: '/', labelKey: 'nav.home', icon: HomeIcon },
    { to: '/households', labelKey: 'nav.households', icon: HouseholdsIcon },
    { to: '/map', labelKey: 'nav.map', icon: MapIcon },
    { to: '/admin', labelKey: 'nav.admin', icon: ShieldIcon },
    { to: '/profile', labelKey: 'nav.profile', icon: ProfileIcon },
  ],
};

export function SyncPill(): JSX.Element {
  const { online, syncing, pendingCount, deviceOnly, lastSyncAt, syncNow, t } = useApp();

  const className = syncing
    ? 'syncing'
    : deviceOnly
      ? ''
      : online
        ? pendingCount > 0
          ? 'offline'
          : 'online'
        : 'offline';

  const label = syncing
    ? t('sync.syncing')
    : deviceOnly
      ? t('sync.deviceOnly')
      : !online
        ? t('sync.offline')
        : pendingCount > 0
          ? t('sync.pending', { count: pendingCount })
          : t('sync.synced');

  const title = deviceOnly
    ? t('sync.deviceOnlyHint')
    : lastSyncAt
      ? t('sync.lastSync', { time: relativeTime(lastSyncAt) })
      : t('sync.never');

  return (
    <button
      type="button"
      className={`sync-pill ${className}`}
      onClick={() => void syncNow()}
      disabled={deviceOnly || syncing}
      title={title}
      aria-label={`${label} — ${title}`}
    >
      {syncing ? (
        <SyncIcon className="spin-icon" />
      ) : (
        <span
          className="dot"
          style={{
            background: deviceOnly
              ? 'var(--ink-faint)'
              : !online || pendingCount > 0
                ? 'var(--warning)'
                : 'var(--green)',
          }}
        />
      )}
      {label}
    </button>
  );
}

export function AppShell({
  title,
  subtitle,
  children,
  actions,
  showNav = true,
  showSync = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  showNav?: boolean;
  showSync?: boolean;
}): JSX.Element {
  const { session, t } = useApp();
  const navItems = session ? NAV_BY_ROLE[session.user.role] : [];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="grow">
          <h1>{title}</h1>
          {subtitle ? <span className="subtitle">{subtitle}</span> : null}
        </div>
        {actions}
        {showSync ? <SyncPill /> : null}
        <span className="tricolour-strip" aria-hidden="true" />
      </header>

      <main className={`app-main${showNav && navItems.length ? '' : ' no-nav'}`}>{children}</main>

      {showNav && navItems.length ? (
        <nav className="bottom-nav" aria-label={t('nav.home')}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <item.icon />
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export function ToastHost(): JSX.Element {
  const { toasts, dismissToast } = useApp();

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast ${toast.kind}`}
          onClick={() => dismissToast(toast.id)}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="empty-state">
      {icon ? (
        <div className="icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3>{title}</h3>
      {hint ? <p className="muted">{hint}</p> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

export function Banner({
  kind = 'info',
  icon,
  title,
  children,
}: {
  kind?: 'info' | 'warning' | 'error' | 'success';
  icon?: string;
  title?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={`banner banner-${kind}`}>
      {icon ? (
        <span className="banner-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div>
        {title ? <strong>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}
