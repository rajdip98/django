import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ToastHost } from './components/Layout';
import { useApp } from './lib/store';
import { AdminScreen } from './screens/Admin';
import { HouseholdFormScreen } from './screens/HouseholdForm';
import { HouseholdsScreen } from './screens/Households';
import { HomeScreen } from './screens/Home';
import { LoginScreen } from './screens/Login';
import { MapScreen } from './screens/Map';
import { NewHouseholdRedirect } from './screens/NewHousehold';
import { NotFoundScreen } from './screens/NotFound';
import { ProfileScreen } from './screens/Profile';
import { SupervisorScreen } from './screens/Supervisor';
import type { Role } from './lib/types';

function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: JSX.Element;
}): JSX.Element {
  const { session } = useApp();
  const location = useLocation();

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(session.user.role)) return <Navigate to="/" replace />;
  return children;
}

export function App(): JSX.Element {
  const { ready, session } = useApp();

  if (!ready) {
    return (
      <div className="boot-screen">
        <div className="boot-mark" />
        <p>Loading Census 2026-27…</p>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <LoginScreen />}
        />

        <Route
          path="/"
          element={session ? <HomeScreen /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/households"
          element={session ? <HouseholdsScreen /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/households/new"
          element={session ? <NewHouseholdRedirect /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/households/:id"
          element={session ? <HouseholdFormScreen /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/map"
          element={session ? <MapScreen /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/profile"
          element={session ? <ProfileScreen /> : <Navigate to="/login" replace />}
        />

        <Route
          path="/supervisor"
          element={
            <RequireRole roles={['supervisor', 'admin']}>
              <SupervisorScreen />
            </RequireRole>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole roles={['admin']}>
              <AdminScreen />
            </RequireRole>
          }
        />

        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
      <ToastHost />
    </>
  );
}
