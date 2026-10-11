package dev.jobflow.auth;

import dev.jobflow.common.ApiException;
import dev.jobflow.common.AuditService;
import dev.jobflow.common.RateLimiter;
import dev.jobflow.user.UserRec;
import dev.jobflow.user.UserRepo;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    public record Tokens(String access, String refresh, AuthUser user) {}

    private final UserRepo users;
    private final JdbcTemplate j;
    private final PasswordEncoder enc;
    private final JwtService jwt;
    private final RateLimiter rl;
    private final AuditService audit;
    private final Duration refreshTtl;
    private final String dummyHash;

    public AuthService(UserRepo users, JdbcTemplate j, PasswordEncoder enc, JwtService jwt, RateLimiter rl, AuditService audit,
                       @Value("${app.jwt.refresh-ttl:7d}") Duration refreshTtl) {
        this.users = users; this.j = j; this.enc = enc; this.jwt = jwt; this.rl = rl; this.audit = audit; this.refreshTtl = refreshTtl;
        this.dummyHash = enc.encode("dummy-password-for-timing");
    }

    public UUID register(String email, String password) {
        try {
            UUID id = users.create(email.trim(), enc.encode(password), "USER", Hashing.randomHex(24));
            audit.log(id, "REGISTER", "user", id);
            return id;
        } catch (DuplicateKeyException e) {
            throw new ApiException(409, "EMAIL_TAKEN", "Email is already registered");
        }
    }

    public Tokens login(String email, String password, String ip) {
        String e = email.trim().toLowerCase();
        rl.hit("rl:login:ip:" + ip, 20, 60);
        rl.hit("rl:login:email:" + e, 10, 60);
        UserRec u = users.byEmail(e).orElse(null);
        boolean ok = enc.matches(password, u == null ? dummyHash : u.passwordHash());
        if (u == null || !ok || !"ACTIVE".equals(u.status())) {
            audit.log(u == null ? null : u.id(), "LOGIN_FAILED", "user", u == null ? null : u.id());
            throw ApiException.unauthorized("Invalid credentials");
        }
        audit.log(u.id(), "LOGIN", "user", u.id());
        return issue(new AuthUser(u.id(), u.email(), u.role()), UUID.randomUUID());
    }

    public Tokens refresh(String raw) {
        if (raw == null || raw.isBlank()) throw ApiException.unauthorized("Missing refresh token");
        var rows = j.query("select id, user_id, family_id, expires_at, revoked_at from refresh_tokens where token_hash = ?",
                (rs, i) -> new Object[]{rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class), rs.getObject("family_id", UUID.class),
                        rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("revoked_at")}, Hashing.sha256(raw));
        if (rows.isEmpty()) throw ApiException.unauthorized("Invalid refresh token");
        Object[] r = rows.get(0);
        UUID id = (UUID) r[0], userId = (UUID) r[1], family = (UUID) r[2];
        // atomic rotation: only one caller can revoke an unrevoked token
        int won = j.update("update refresh_tokens set revoked_at = now() where id = ? and revoked_at is null and expires_at > now()", id);
        if (won == 0) {
            if (r[4] != null) j.update("update refresh_tokens set revoked_at = coalesce(revoked_at, now()) where family_id = ?", family); // reuse detected
            throw ApiException.unauthorized("Refresh token is no longer valid");
        }
        AuthUser u = users.activeAuth(userId).orElseThrow(() -> ApiException.unauthorized("Account disabled"));
        Tokens t = issue(u, family);
        j.update("update refresh_tokens set replaced_by = (select id from refresh_tokens where token_hash = ?) where id = ?", Hashing.sha256(t.refresh()), id);
        return t;
    }

    public void logout(String raw) {
        if (raw != null && !raw.isBlank()) j.update("update refresh_tokens set revoked_at = coalesce(revoked_at, now()) where token_hash = ?", Hashing.sha256(raw));
    }

    public void revokeAll(UUID userId) { j.update("update refresh_tokens set revoked_at = now() where user_id = ? and revoked_at is null", userId); }

    public void changePassword(UUID userId, String current, String next) {
        UserRec u = users.byId(userId).orElseThrow(() -> ApiException.notFound("User"));
        if (!enc.matches(current, u.passwordHash())) throw new ApiException(400, "WRONG_PASSWORD", "Current password is incorrect");
        users.setPassword(userId, enc.encode(next));
        revokeAll(userId);
        audit.log(userId, "PASSWORD_CHANGED", "user", userId);
    }

    public long refreshTtlSeconds() { return refreshTtl.toSeconds(); }

    private Tokens issue(AuthUser u, UUID family) {
        String raw = Hashing.randomToken(32);
        j.update("insert into refresh_tokens(user_id, family_id, token_hash, expires_at) values (?,?,?,?)",
                u.id(), family, Hashing.sha256(raw), Timestamp.from(Instant.now().plus(refreshTtl)));
        return new Tokens(jwt.issue(u.id()), raw, u);
    }
}
