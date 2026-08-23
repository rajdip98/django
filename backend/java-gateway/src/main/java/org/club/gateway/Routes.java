package org.club.gateway;

import java.util.List;

/** Which upstream owns which path, and which paths get the strict treatment. */
public final class Routes {

    public enum Upstream { PYTHON, CSHARP, DASH }

    /** Django owns the panels, authentication, media and the QR endpoints. */
    private static final List<String> PYTHON_PREFIXES = List.of(
            "/adminpanel", "/superadminpanel", "/admin/", "/accounts/", "/login",
            "/logout", "/media/", "/static/", "/qr/", "/dashboard", "/membership");

    /** The C# service answers read-only public content. */
    private static final List<String> CSHARP_PREFIXES = List.of("/api/");

    /** The Dash dashboard, reachable only by a signed-in administrator. */
    private static final List<String> DASH_PREFIXES = List.of("/analytics");

    /** Paths that must never be cached and that get the tighter rate limit. */
    private static final List<String> SENSITIVE_PREFIXES = List.of(
            "/adminpanel", "/superadminpanel", "/admin/", "/accounts/", "/login",
            "/analytics", "/api/");

    /** Login and elevation endpoints — the ones worth brute-forcing. */
    private static final List<String> AUTH_PREFIXES = List.of(
            "/adminpanel/login", "/superadminpanel/login", "/adminpanel/unlock",
            "/superadminpanel/unlock", "/adminpanel/elevate", "/login");

    private Routes() {}

    public static Upstream upstreamFor(String path) {
        if (matches(path, CSHARP_PREFIXES)) return Upstream.CSHARP;
        if (matches(path, DASH_PREFIXES)) return Upstream.DASH;
        if (matches(path, PYTHON_PREFIXES)) return Upstream.PYTHON;
        return Upstream.PYTHON;   // Django serves the site itself.
    }

    public static boolean isSensitive(String path) { return matches(path, SENSITIVE_PREFIXES); }

    public static boolean isAuthEndpoint(String path) { return matches(path, AUTH_PREFIXES); }

    public static boolean isAnalytics(String path) { return matches(path, DASH_PREFIXES); }

    private static boolean matches(String path, List<String> prefixes) {
        if (path == null) return false;
        String p = path.toLowerCase();
        for (String prefix : prefixes) {
            if (p.equals(prefix) || p.startsWith(prefix)
                    || p.equals(stripTrailing(prefix))) {
                return true;
            }
        }
        return false;
    }

    private static String stripTrailing(String prefix) {
        return prefix.endsWith("/") ? prefix.substring(0, prefix.length() - 1) : prefix;
    }
}
