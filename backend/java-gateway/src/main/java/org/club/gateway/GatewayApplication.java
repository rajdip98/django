package org.club.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * The public front door for the club platform.
 *
 * Django, the C# API and the Dash dashboard all bind to localhost. Nothing on
 * the internet reaches them directly; every request arrives here first, passes
 * the filter chain (guard, rate limit, headers) and is then proxied on.
 */
@SpringBootApplication
@EnableConfigurationProperties(GatewayProperties.class)
public class GatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
