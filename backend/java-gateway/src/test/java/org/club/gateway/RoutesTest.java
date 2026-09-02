package org.club.gateway;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RoutesTest {

    @Test
    void apiPathsGoToTheCSharpService() {
        assertEquals(Routes.Upstream.CSHARP, Routes.upstreamFor("/api/events"));
        assertEquals(Routes.Upstream.CSHARP, Routes.upstreamFor("/api/news?page=2"));
    }

    @Test
    void analyticsGoesToDash() {
        assertEquals(Routes.Upstream.DASH, Routes.upstreamFor("/analytics"));
        assertEquals(Routes.Upstream.DASH, Routes.upstreamFor("/analytics/_dash-layout"));
        assertTrue(Routes.isAnalytics("/analytics/"));
    }

    @Test
    void everythingElseGoesToDjango() {
        assertEquals(Routes.Upstream.PYTHON, Routes.upstreamFor("/"));
        assertEquals(Routes.Upstream.PYTHON, Routes.upstreamFor("/adminpanel/login/"));
        assertEquals(Routes.Upstream.PYTHON, Routes.upstreamFor("/superadminpanel/login/"));
        assertEquals(Routes.Upstream.PYTHON, Routes.upstreamFor("/events/annual-meet/"));
    }

    @Test
    void panelsAndApiAreTreatedAsSensitive() {
        assertTrue(Routes.isSensitive("/adminpanel/dashboard/"));
        assertTrue(Routes.isSensitive("/superadminpanel/"));
        assertTrue(Routes.isSensitive("/api/events"));
        assertFalse(Routes.isSensitive("/about/"));
    }

    @Test
    void loginEndpointsGetTheTighterLimit() {
        assertTrue(Routes.isAuthEndpoint("/adminpanel/login/"));
        assertTrue(Routes.isAuthEndpoint("/superadminpanel/unlock/"));
        assertFalse(Routes.isAuthEndpoint("/adminpanel/events/"));
    }
}
