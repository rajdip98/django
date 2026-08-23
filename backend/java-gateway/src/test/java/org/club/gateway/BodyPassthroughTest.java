package org.club.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The gateway forwards request bodies untouched.
 *
 * If Spring's multipart handling is switched on, it reads the body first and
 * the proxy forwards an empty one — every form carrying a file then fails at
 * Django with a CSRF error, because the token was in the body that got eaten.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class BodyPassthroughTest {

    @Autowired
    private Environment environment;

    @Test
    void multipartParsingStaysOff() {
        assertEquals("false", environment.getProperty("spring.servlet.multipart.enabled"),
                "uploads break silently if Spring parses the body before the proxy reads it");
    }

    @Test
    void theGatewayServesNoStaticFilesOfItsOwn() {
        assertEquals("false", environment.getProperty("spring.web.resources.add-mappings"));
    }
}
