package org.club.gateway;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;

/**
 * Cross-origin access is closed by default. Only the origins named in
 * ALLOWED_ORIGINS may call the API from a browser, and wildcards are refused
 * outright — credentials plus "*" is the classic way to leak a session.
 */
@Configuration
public class CorsConfig {

    @Bean
    public WebMvcConfigurer corsConfigurer(GatewayProperties properties) {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                String[] origins = Arrays.stream(properties.getAllowedOrigins().split(","))
                        .map(String::trim)
                        .filter(o -> !o.isEmpty() && !o.equals("*"))
                        .toArray(String[]::new);
                if (origins.length == 0) return;

                // The contact form is the one write the public may make, so it
                // is allowed by path rather than by opening POST across the API.
                //
                // This must be registered before "/api/**": Spring returns the
                // first pattern that matches, and the catch-all would otherwise
                // answer for this path and refuse the POST.
                registry.addMapping("/api/enquiries")
                        .allowedOrigins(origins)
                        .allowedMethods("POST", "OPTIONS")
                        .allowedHeaders("Accept", "Content-Type", "X-Requested-With")
                        .allowCredentials(false)
                        .maxAge(600);

                // Reads are open to the named origins.
                registry.addMapping("/api/**")
                        .allowedOrigins(origins)
                        .allowedMethods("GET", "HEAD", "OPTIONS")
                        .allowedHeaders("Accept", "Content-Type", "X-Requested-With")
                        .allowCredentials(false)
                        .maxAge(600);
            }
        };
    }
}
