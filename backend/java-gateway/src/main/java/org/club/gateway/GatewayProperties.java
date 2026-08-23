package org.club.gateway;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "gateway")
public class GatewayProperties {
    private String pythonApi = "http://127.0.0.1:8000";
    private String csharpApi = "http://127.0.0.1:5081";
    private String dashAnalytics = "http://127.0.0.1:8050";
    private String allowedOrigins = "http://localhost:5173,http://127.0.0.1:5173";
    private int rateLimitPerMinute = 300;
    private int authRateLimitPerMinute = 10;

    public String getPythonApi() { return pythonApi; }
    public void setPythonApi(String v) { this.pythonApi = trimSlash(v); }

    public String getCsharpApi() { return csharpApi; }
    public void setCsharpApi(String v) { this.csharpApi = trimSlash(v); }

    public String getDashAnalytics() { return dashAnalytics; }
    public void setDashAnalytics(String v) { this.dashAnalytics = trimSlash(v); }

    public String getAllowedOrigins() { return allowedOrigins; }
    public void setAllowedOrigins(String v) { this.allowedOrigins = v; }

    public int getRateLimitPerMinute() { return rateLimitPerMinute; }
    public void setRateLimitPerMinute(int v) { this.rateLimitPerMinute = v; }

    public int getAuthRateLimitPerMinute() { return authRateLimitPerMinute; }
    public void setAuthRateLimitPerMinute(int v) { this.authRateLimitPerMinute = v; }

    private static String trimSlash(String v) {
        if (v == null) return null;
        return v.endsWith("/") ? v.substring(0, v.length() - 1) : v;
    }
}
