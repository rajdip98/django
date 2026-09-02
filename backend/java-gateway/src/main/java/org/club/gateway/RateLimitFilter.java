package org.club.gateway;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A fixed-window counter per caller. Ordinary browsing gets a generous
 * allowance; the login and elevation endpoints get a much tighter one, so a
 * password-guessing run is throttled at the edge as well as by Django's own
 * lockout after five failures.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 30)
public class RateLimitFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    private final GatewayProperties properties;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private volatile Instant lastSweep = Instant.now();

    public RateLimitFilter(GatewayProperties properties) {
        this.properties = properties;
    }

    private static final class Window {
        final AtomicInteger count = new AtomicInteger();
        volatile long startedAtEpochSecond;

        Window(long now) { this.startedAtEpochSecond = now; }
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        String path = request.getRequestURI();
        boolean auth = Routes.isAuthEndpoint(path);
        int limit = auth ? properties.getAuthRateLimitPerMinute() : properties.getRateLimitPerMinute();

        // Counting reads against the login limit would lock a person out of the
        // form itself; only the submission counts.
        if (auth && "GET".equalsIgnoreCase(request.getMethod())) {
            limit = properties.getRateLimitPerMinute();
        }

        String key = (auth ? "auth|" : "std|") + ClientAddress.of(request);
        long now = Instant.now().getEpochSecond();
        sweep(now);

        Window window = windows.computeIfAbsent(key, k -> new Window(now));
        synchronized (window) {
            if (now - window.startedAtEpochSecond >= 60) {
                window.startedAtEpochSecond = now;
                window.count.set(0);
            }
        }

        int used = window.count.incrementAndGet();
        int remaining = Math.max(0, limit - used);
        response.setHeader("X-RateLimit-Limit", String.valueOf(limit));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(remaining));

        if (used > limit) {
            long retryAfter = Math.max(1, 60 - (now - window.startedAtEpochSecond));
            response.setHeader("Retry-After", String.valueOf(retryAfter));
            log.warn("rate limit hit for {} on {}", key, path);
            RequestGuardFilter.deny(response, 429, "too_many_requests");
            return;
        }

        chain.doFilter(req, res);
    }

    /** Drop windows nobody has touched for a while so the map cannot grow without bound. */
    private void sweep(long now) {
        if (Duration.between(lastSweep, Instant.now()).toSeconds() < 120) return;
        lastSweep = Instant.now();
        windows.entrySet().removeIf(e -> now - e.getValue().startedAtEpochSecond > 300);
    }
}
