import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import { useData } from './components/useData.js';
import { SiteContext } from './components/SiteContext.js';
import { api } from './api.js';
import { FALLBACK } from './data/fallback.js';

import Home from './pages/Home.jsx';
import About from './pages/About.jsx';
import Events from './pages/Events.jsx';
import EventDetail from './pages/EventDetail.jsx';
import Activities from './pages/Activities.jsx';
import Gallery from './pages/Gallery.jsx';
import Team from './pages/Team.jsx';
import News from './pages/News.jsx';
import Membership from './pages/Membership.jsx';
import Resources from './pages/Resources.jsx';
import Contact from './pages/Contact.jsx';
import Search from './pages/Search.jsx';
import NotFound from './pages/NotFound.jsx';

/** Start each new page at the top, the way a full page load would. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  // The site name, address and contact details come from the backend so an
  // administrator can change them without a redeploy.
  const siteState = useData(() => api.site(), []);
  const notices = useData(() => api.notices(5), []);
  const site = { ...FALLBACK.site, ...(siteState.data ?? {}) };

  // The home page owns its own title; every other page sets one via <Page>.
  useEffect(() => {
    if (window.location.pathname === '/') document.title = site.organizationName;
  }, [site.organizationName]);

  return (
    <SiteContext.Provider value={site}>
      <a className="skip-link" href="#main">Skip to content</a>
      <ScrollToTop />
      <Header site={site} notices={notices.data ?? []} />

      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home site={site} />} />
          <Route path="/about" element={<About site={site} />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:slug" element={<EventDetail />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/team" element={<Team />} />
          <Route path="/news" element={<News />} />
          <Route path="/membership" element={<Membership />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/contact" element={<Contact site={site} />} />
          <Route path="/search" element={<Search />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer site={site} />
    </SiteContext.Provider>
  );
}
