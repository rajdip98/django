/** Creates a blank household then hands off to the form.
 *
 * Done as its own route so the "New household" button is a plain link that
 * survives an offline reload, and so a refresh never creates a duplicate.
 */

import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useApp } from '../lib/store';

export function NewHouseholdRedirect(): JSX.Element {
  const { createHousehold, saveHousehold, session, households, t } = useApp();
  const navigate = useNavigate();
  const startedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  // A citizen enumerates exactly one household — reuse it rather than making more.
  const existingCitizenHousehold =
    session?.user.role === 'citizen' ? households[0] : undefined;

  useEffect(() => {
    if (startedRef.current || existingCitizenHousehold) return;
    startedRef.current = true;

    (async () => {
      try {
        const draft = await saveHousehold(createHousehold());
        navigate(`/households/${draft.id}`, { replace: true });
      } catch (error) {
        console.error('census: could not create household', error);
        setFailed(true);
      }
    })();
  }, [createHousehold, existingCitizenHousehold, navigate, saveHousehold]);

  if (existingCitizenHousehold) {
    return <Navigate to={`/households/${existingCitizenHousehold.id}`} replace />;
  }

  if (failed) {
    return (
      <div className="app-shell">
        <main className="app-main no-nav">
          <div className="card stack">
            <h2 style={{ fontSize: '1.05rem' }}>{t('common.error')}</h2>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/households')}>
              {t('common.back')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="boot-screen">
      <div className="boot-mark" />
      <p>{t('common.loading')}</p>
    </div>
  );
}
