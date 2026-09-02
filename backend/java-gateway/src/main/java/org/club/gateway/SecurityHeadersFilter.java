package org.club.gateway;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Stamps the response headers a browser needs in order to defend the user, and
 * strips the ones that tell an attacker what is running behind the gateway.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class SecurityHeadersFilter implements Filter {

    /** Same policy the Django panels ship with, applied to every service. */
    private static final String CSP = String.join("; ",
            "default-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "img-src 'self' data: blob:",
            "style-src 'self' 'unsafe-inline'",
            "script-src 'self' 'unsafe-inline'",
            "connect-src 'self'",
            "font-src 'self' data:");

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletResponse response = (HttpServletResponse) res;
        HttpServletRequest request = (HttpServletRequest) req;

        response.setHeader("Content-Security-Policy", CSP);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        response.setHeader("Permissions-Policy",
                "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()");
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        response.setHeader("X-Permitted-Cross-Domain-Policies", "none");

        // Only meaningful over TLS, and only safe to send there.
        if (request.isSecure() || "https".equalsIgnoreCase(request.getHeader("X-Forwarded-Proto"))) {
            response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        }

        // Anything under a panel or the API must never be cached by a proxy.
        String path = request.getRequestURI();
        if (Routes.isSensitive(path)) {
            response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
            response.setHeader("Pragma", "no-cache");
        }

        chain.doFilter(req, res);
    }
}
