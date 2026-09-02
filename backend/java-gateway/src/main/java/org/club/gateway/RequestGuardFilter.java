package org.club.gateway;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Set;

/**
 * Rejects requests that no legitimate client sends, before they cost an
 * upstream anything: unknown verbs, traversal attempts, encoded nulls and the
 * scanner paths that hit every public host within minutes of it going live.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RequestGuardFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(RequestGuardFilter.class);

    private static final Set<String> ALLOWED_METHODS =
            Set.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS");

    /** Probes for secrets or for software this platform does not run. */
    private static final List<String> BLOCKED_FRAGMENTS = List.of(
            "/.env", "/.git", "/.aws", "/.ssh", "/wp-admin", "/wp-login", "/wp-content",
            "/vendor/phpunit", "/phpmyadmin", "/.well-known/security.txt.php",
            "/config.json", "/id_rsa", "/.htpasswd", "/server-status");

    private static final int MAX_URI_LENGTH = 2048;
    private static final int MAX_QUERY_LENGTH = 4096;

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        String method = request.getMethod() == null ? "" : request.getMethod().toUpperCase();
        if (!ALLOWED_METHODS.contains(method)) {
            deny(response, 405, "method_not_allowed");
            return;
        }

        String uri = request.getRequestURI() == null ? "" : request.getRequestURI();
        String query = request.getQueryString();

        if (uri.length() > MAX_URI_LENGTH || (query != null && query.length() > MAX_QUERY_LENGTH)) {
            deny(response, 414, "uri_too_long");
            return;
        }

        String lower = uri.toLowerCase();
        // Traversal, in plain and encoded form, and embedded nulls.
        if (lower.contains("..") || lower.contains("%2e%2e") || lower.contains("%00")
                || lower.contains("\\") || uri.indexOf('\0') >= 0) {
            log.warn("blocked traversal attempt from {} for {}", ClientAddress.of(request), safe(uri));
            deny(response, 400, "bad_path");
            return;
        }

        for (String fragment : BLOCKED_FRAGMENTS) {
            if (lower.contains(fragment)) {
                log.warn("blocked scanner path from {} for {}", ClientAddress.of(request), safe(uri));
                deny(response, 404, "not_found");
                return;
            }
        }

        chain.doFilter(req, res);
    }

    /** Never echo raw request text back into the log line unescaped. */
    private static String safe(String value) {
        String trimmed = value.length() > 200 ? value.substring(0, 200) : value;
        return trimmed.replaceAll("[\\r\\n\\t]", "_");
    }

    static void deny(HttpServletResponse response, int status, String code) throws IOException {
        response.reset();
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"" + code + "\"}");
    }
}
