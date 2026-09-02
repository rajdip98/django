package org.club.gateway;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Works out who is calling.
 *
 * X-Forwarded-For is client-controlled, so it is only trusted when the request
 * genuinely arrived from a proxy we run (set TRUSTED_PROXIES). Otherwise the
 * socket address wins — a spoofed header must not let anyone dodge the rate
 * limiter by inventing a new identity per request.
 */
public final class ClientAddress {

    private static final String TRUSTED = System.getenv().getOrDefault("TRUSTED_PROXIES", "");

    private ClientAddress() {}

    public static String of(HttpServletRequest request) {
        String remote = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
        if (TRUSTED.isBlank()) return remote;

        for (String proxy : TRUSTED.split(",")) {
            if (proxy.trim().equals(remote)) {
                String forwarded = request.getHeader("X-Forwarded-For");
                if (forwarded != null && !forwarded.isBlank()) {
                    String first = forwarded.split(",")[0].trim();
                    if (!first.isEmpty() && first.length() <= 45) return first;
                }
                break;
            }
        }
        return remote;
    }
}
