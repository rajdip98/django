package org.club.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** The rule the gateway applies to Django's answer before opening the dashboard. */
class SessionAuthorityTest {

    private final ObjectMapper json = new ObjectMapper();

    private boolean decide(String body) throws Exception {
        return SessionAuthority.isAllowed(json.readTree(body));
    }

    @Test
    void signedInAdminIsAllowed() throws Exception {
        assertTrue(decide("""
            {"authenticated": true, "role": "admin", "elevated": false,
             "must_change_password": false}"""));
    }

    @Test
    void superAdminIsAllowed() throws Exception {
        assertTrue(decide("""
            {"authenticated": true, "role": "super_admin", "elevated": true,
             "must_change_password": false}"""));
    }

    @Test
    void anonymousIsRefused() throws Exception {
        assertFalse(decide("{\"authenticated\": false}"));
    }

    @Test
    void accountStillOwingItsFirstPasswordChangeIsRefused() throws Exception {
        // Signing in on the shared default password is not a finished sign-in.
        assertFalse(decide("""
            {"authenticated": true, "role": "super_admin", "elevated": false,
             "must_change_password": true}"""));
    }

    @Test
    void unknownRoleIsRefused() throws Exception {
        assertFalse(decide("""
            {"authenticated": true, "role": "member", "must_change_password": false}"""));
    }

    @Test
    void garbageIsRefused() throws Exception {
        assertFalse(decide("{}"));
        assertFalse(SessionAuthority.isAllowed(null));
    }
}
