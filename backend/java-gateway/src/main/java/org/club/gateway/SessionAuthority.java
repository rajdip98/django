package org.club.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Django is the only component that decides who is signed in. The gateway asks
 * it — it never reads a session cookie itself and never keeps its own user
 * table, so there is exactly one place where an account can be disabled.
 *
 * Answers are cached for a few seconds so that a dashboard making many requests
 * does not turn into a request storm against Django.
 */
@Component
public class SessionAuthority {

    private static final Logger log = LoggerFactory.getLogger(SessionAuthority.class);
    private static final Duration CACHE_TTL = Duration.ofSeconds(15);

    private final GatewayProperties properties;
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();
    private final ObjectMapper json = new ObjectMapper();

    public SessionAuthority(GatewayProperties properties) {
        this.properties = properties;
    }

    private record Cached(boolean allowed, Instant expiresAt) {}

    /** True when the caller holds a signed-in staff session. */
    public boolean isStaff(HttpServletRequest request) {
        String cookie = request.getHeader("Cookie");
        if (cookie == null || cookie.isBlank()) return false;

        Cached hit = cache.get(cookie);
        if (hit != null && hit.expiresAt().isAfter(Instant.now())) return hit.allowed();

        boolean allowed = ask(cookie);
        cache.put(cookie, new Cached(allowed, Instant.now().plus(CACHE_TTL)));
        if (cache.size() > 2000) cache.clear();
        return allowed;
    }

    /**
     * The rule, kept separate from the network call so it can be tested.
     *
     * An account that has not yet replaced its shared default password is not
     * finished signing in. Django already refuses it every panel section, and
     * the dashboard is no different.
     */
    static boolean isAllowed(JsonNode answer) {
        if (answer == null || !answer.path("authenticated").asBoolean(false)) return false;
        if (answer.path("must_change_password").asBoolean(false)) return false;

        String role = answer.path("role").asText("");
        return role.equals("admin") || role.equals("super_admin");
    }

    private boolean ask(String cookie) {
        try {
            HttpRequest probe = HttpRequest.newBuilder()
                    .uri(URI.create(properties.getPythonApi() + "/adminpanel/session-check/"))
                    .timeout(Duration.ofSeconds(3))
                    .header("Cookie", cookie)
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = client.send(probe, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) return false;
            return isAllowed(json.readTree(response.body()));
        } catch (Exception e) {
            // If the authority cannot be reached, nobody is authorised.
            log.warn("session check failed: {}", e.getClass().getSimpleName());
            return false;
        }
    }
}
