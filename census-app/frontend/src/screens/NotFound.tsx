import { Link } from 'react-router-dom';

import { AppShell, EmptyState } from '../components/Layout';
import { useApp } from '../lib/store';

export function NotFoundScreen(): JSX.Element {
  const { t, session } = useApp();

  return (
    <AppShell title={t('app.shortTitle')} showNav={Boolean(session)} showSync={false}>
      <div className="card">
        <EmptyState
          icon="🧭"
          title={t('error.notFound')}
          action={
            <Link className="btn btn-primary" to={session ? '/' : '/login'}>
              {t('error.goHome')}
            </Link>
          }
        />
      </div>
    </AppShell>
  );
}
