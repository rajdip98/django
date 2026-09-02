package org.club.gateway;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;

class GuardAndLimitTest {

    private final RequestGuardFilter guard = new RequestGuardFilter();

    private MockHttpServletResponse run(String method, String uri) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setRemoteAddr("203.0.113.9");
        MockHttpServletResponse response = new MockHttpServletResponse();
        guard.doFilter(request, response, new MockFilterChain());
        return response;
    }

    @Test
    void ordinaryRequestPasses() throws Exception {
        assertEquals(200, run("GET", "/events/").getStatus());
    }

    @Test
    void unknownVerbIsRefused() throws Exception {
        assertEquals(405, run("TRACE", "/").getStatus());
    }

    @Test
    void traversalIsRefused() throws Exception {
        assertEquals(400, run("GET", "/static/../../etc/passwd").getStatus());
        assertEquals(400, run("GET", "/media/%2e%2e/secrets").getStatus());
    }

    @Test
    void scannerPathsLookLikeNothingIsThere() throws Exception {
        assertEquals(404, run("GET", "/.env").getStatus());
        assertEquals(404, run("GET", "/wp-login.php").getStatus());
    }

    @Test
    void securityHeadersAreStamped() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/adminpanel/login/");
        MockHttpServletResponse response = new MockHttpServletResponse();
        new SecurityHeadersFilter().doFilter(request, response, new MockFilterChain());

        assertTrue(response.getHeader("Content-Security-Policy").contains("frame-ancestors 'none'"));
        assertEquals("nosniff", response.getHeader("X-Content-Type-Options"));
        assertEquals("DENY", response.getHeader("X-Frame-Options"));
        assertTrue(response.getHeader("Cache-Control").contains("no-store"));
    }

    @Test
    void loginAttemptsAreThrottledSoonerThanBrowsing() throws Exception {
        GatewayProperties properties = new GatewayProperties();
        properties.setRateLimitPerMinute(100);
        properties.setAuthRateLimitPerMinute(3);
        RateLimitFilter limiter = new RateLimitFilter(properties);

        int lastStatus = 200;
        for (int i = 0; i < 5; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/adminpanel/login/");
            request.setRemoteAddr("198.51.100.4");
            MockHttpServletResponse response = new MockHttpServletResponse();
            FilterChain chain = new MockFilterChain();
            limiter.doFilter(request, response, chain);
            lastStatus = response.getStatus();
        }
        assertEquals(429, lastStatus, "the fourth login attempt in a minute should be refused");
    }

    @Test
    void spoofedForwardedHeaderCannotChangeIdentity() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/");
        request.setRemoteAddr("203.0.113.9");
        request.addHeader("X-Forwarded-For", "1.2.3.4");
        // TRUSTED_PROXIES is unset here, so the socket address must win.
        assertEquals("203.0.113.9", ClientAddress.of(request));
    }
}
