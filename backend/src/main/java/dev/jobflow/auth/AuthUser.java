package dev.jobflow.auth;

import java.util.UUID;

public record AuthUser(UUID id, String email, String role) {
    public boolean admin() { return "ADMIN".equals(role); }
}
