package org.club.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.config.annotation.CorsRegistry;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** The contact form must be able to POST; nothing else may. */
class CorsConfigTest {

    @SuppressWarnings("unchecked")
    private Map<String, org.springframework.web.cors.CorsConfiguration> mappings(String origins)
            throws Exception {
        GatewayProperties properties = new GatewayProperties();
        properties.setAllowedOrigins(origins);

        CorsRegistry registry = new CorsRegistry();
        new CorsConfig().corsConfigurer(properties).addCorsMappings(registry);

        // The accessor is protected; reach it reflectively.
        var method = CorsRegistry.class.getDeclaredMethod("getCorsConfigurations");
        method.setAccessible(true);
        return (Map<String, org.springframework.web.cors.CorsConfiguration>) method.invoke(registry);
    }

    @Test
    void enquiriesAcceptPostAndTheRestDoNot() throws Exception {
        var mappings = mappings("https://club.example.org");

        List<String> readMethods = mappings.get("/api/**").getAllowedMethods();
        assertTrue(readMethods.contains("GET"));
        assertFalse(readMethods.contains("POST"), "the API at large must stay read-only");

        List<String> writeMethods = mappings.get("/api/enquiries").getAllowedMethods();
        assertTrue(writeMethods.contains("POST"), "the contact form has to be able to post");
    }

    @Test
    void theSpecificPathIsConsultedBeforeTheCatchAll() throws Exception {
        // Spring returns the first matching pattern, so registration order is
        // what decides whether the contact form's POST is allowed at all.
        var keys = List.copyOf(mappings("https://club.example.org").keySet());
        assertEquals("/api/enquiries", keys.get(0),
                "the enquiries mapping must be registered before /api/**");
        assertEquals("/api/**", keys.get(1));
    }

    @Test
    void credentialsAreNeverAllowed() throws Exception {
        var mappings = mappings("https://club.example.org");
        for (var configuration : mappings.values()) {
            assertNotEquals(Boolean.TRUE, configuration.getAllowCredentials(),
                    "credentials plus a permissive origin is how sessions leak");
        }
    }

    @Test
    void aWildcardOriginIsIgnored() throws Exception {
        assertTrue(mappings("*").isEmpty(), "'*' must not become an allowed origin");
    }
}
