import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider } from './lib/store';
import { appBasePath } from './lib/utils';
import './styles/app.css';
import 'leaflet/dist/leaflet.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      {/* Hash routing keeps deep links working on any host — shared hosting,
          a subfolder, S3, even file:// — with no rewrite rules to configure. */}
      <HashRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
);

/* Progressive Web App registration. Skipped on file:// where service workers
   are unavailable — the app still runs, just without background caching. */
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    const base = appBasePath();
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((error) => {
      console.warn('census: service worker registration failed', error);
    });
  });
}
