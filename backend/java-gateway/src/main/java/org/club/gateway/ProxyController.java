package org.club.gateway;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The reverse proxy itself. Everything that survived the filter chain is
 * forwarded to whichever service owns the path, and the reply is streamed back.
 */
@RestController
public class ProxyController {

    private static final Logger log = LoggerFactory.getLogger(ProxyController.class);

    /** Headers that describe one hop and must not be copied to the next. */
    private static final Set<String> HOP_BY_HOP = Set.of(
            "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
            "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length");

    private static final int MAX_BODY_BYTES = 12 * 1024 * 1024;

    private final GatewayProperties properties;
    private final SessionAuthority sessionAuthority;
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public ProxyController(GatewayProperties properties, SessionAuthority sessionAuthority) {
        this.properties = properties;
        this.sessionAuthority = sessionAuthority;
    }

    @RequestMapping("/**")
    public void proxy(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String path = request.getRequestURI();

        if ("/gateway/health".equals(path)) {
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"status\":\"ok\"}");
            return;
        }

        // The analytics dashboard has no login of its own, so the gateway is
        // what stands in front of it: no staff session, no dashboard.
        if (Routes.isAnalytics(path) && !sessionAuthority.isStaff(request)) {
            response.setStatus(HttpServletResponse.SC_FOUND);
            response.setHeader("Location", "/adminpanel/login/?next=" + path);
            return;
        }

        Routes.Upstream upstream = Routes.upstreamFor(path);
        String base = switch (upstream) {
            case CSHARP -> properties.getCsharpApi();
            case DASH -> properties.getDashAnalytics();
            case PYTHON -> properties.getPythonApi();
        };

        String query = request.getQueryString();
        URI target = URI.create(base + path + (query == null || query.isBlank() ? "" : "?" + query));

        byte[] body = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
        if (body.length > MAX_BODY_BYTES) {
            RequestGuardFilter.deny(response, 413, "payload_too_large");
            return;
        }

        HttpRequest.Builder outbound = HttpRequest.newBuilder(target)
                .timeout(Duration.ofSeconds(30))
                .method(request.getMethod(), body.length == 0
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofByteArray(body));

        request.getHeaderNames().asIterator().forEachRemaining(name -> {
            if (HOP_BY_HOP.contains(name.toLowerCase(Locale.ROOT))) return;
            // Forwarded-* headers are re-set below; drop whatever the client sent.
            if (name.toLowerCase(Locale.ROOT).startsWith("x-forwarded")) return;
            request.getHeaders(name).asIterator()
                    .forEachRemaining(value -> safeHeader(outbound, name, value));
        });

        outbound.header("X-Forwarded-For", ClientAddress.of(request));
        outbound.header("X-Forwarded-Host", hostHeader(request));
        outbound.header("X-Forwarded-Proto", forwardedProto(request));
        outbound.header("X-Gateway", "club-java-gateway");
        // Host cannot be set on an outgoing java.net.http request — the JDK owns
        // it. Django reads the visitor's real host from X-Forwarded-Host, which
        // is why config/settings.py sets USE_X_FORWARDED_HOST.

        try {
            HttpResponse<byte[]> upstreamResponse =
                    client.send(outbound.build(), HttpResponse.BodyHandlers.ofByteArray());
            response.setStatus(upstreamResponse.statusCode());
            upstreamResponse.headers().map().forEach((name, values) -> {
                if (HOP_BY_HOP.contains(name.toLowerCase(Locale.ROOT))) return;
                // The filter chain has already set its own copies of these.
                if (name.equalsIgnoreCase("content-security-policy")
                        || name.equalsIgnoreCase("x-frame-options")) return;
                for (String value : values) response.addHeader(name, value);
            });
            response.getOutputStream().write(upstreamResponse.body());
        } catch (Exception e) {
            log.error("upstream {} unreachable for {}: {}", upstream, path, e.getClass().getSimpleName());
            response.setStatus(HttpServletResponse.SC_BAD_GATEWAY);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"upstream_unavailable\"}");
        }
    }

    /** java.net.http refuses some header names outright; skip rather than fail the request. */
    private static void safeHeader(HttpRequest.Builder builder, String name, String value) {
        try {
            builder.header(name, value);
        } catch (IllegalArgumentException ignored) {
            // Restricted header — the JDK sets its own.
        }
    }

    private static String hostHeader(HttpServletRequest request) {
        String host = request.getHeader("Host");
        return host == null ? "localhost" : host;
    }

    private static String forwardedProto(HttpServletRequest request) {
        return request.isSecure() ? "https" : "http";
    }

    static List<String> hopByHop() { return List.copyOf(HOP_BY_HOP); }
}
