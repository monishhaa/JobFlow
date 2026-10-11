package dev.jobflow.auth;

import dev.jobflow.common.ApiException;
import dev.jobflow.common.AuditService;
import dev.jobflow.stats.StatsService;
import dev.jobflow.user.UserRec;
import dev.jobflow.user.UserRepo;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@Profile("!worker")
public class AccountController {
    public record PasswordChange(@NotBlank String currentPassword, @NotBlank @Size(min = 8, max = 72) String newPassword) {}
    public record KeyRequest(@NotBlank @Size(max = 100) String name) {}

    private final UserRepo users;
    private final AuthService auth;
    private final ApiKeyService keys;
    private final AuditService audit;
    private final StatsService stats;

    public AccountController(UserRepo users, AuthService auth, ApiKeyService keys, AuditService audit, StatsService stats) {
        this.users = users; this.auth = auth; this.keys = keys; this.audit = audit; this.stats = stats;
    }

    @GetMapping("/me")
    public Map<String, Object> me(@AuthenticationPrincipal AuthUser u) {
        UserRec r = users.byId(u.id()).orElseThrow(() -> ApiException.notFound("User"));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.id()); m.put("email", r.email()); m.put("role", r.role()); m.put("createdAt", r.createdAt());
        m.put("webhookSecret", r.webhookSecret());
        m.put("quotas", Map.of("maxRunning", r.maxRunning(), "maxQueued", r.maxQueued(), "rateLimitPerMin", r.rateLimitPerMin()));
        m.put("usage", stats.usage(u, r));
        return m;
    }

    @PostMapping("/me/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void password(@AuthenticationPrincipal AuthUser u, @Valid @RequestBody PasswordChange p) { auth.changePassword(u.id(), p.currentPassword(), p.newPassword()); }

    @PostMapping("/me/webhook-secret/rotate")
    public Map<String, String> rotate(@AuthenticationPrincipal AuthUser u) {
        String s = Hashing.randomHex(24);
        users.setWebhookSecret(u.id(), s);
        return Map.of("webhookSecret", s);
    }

    @PostMapping("/keys")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiKeyService.Created createKey(@AuthenticationPrincipal AuthUser u, @Valid @RequestBody KeyRequest r) {
        var k = keys.create(u.id(), r.name());
        audit.log(u.id(), "API_KEY_CREATED", "api_key", k.id());
        return k;
    }

    @GetMapping("/keys")
    public List<Map<String, Object>> listKeys(@AuthenticationPrincipal AuthUser u) { return keys.list(u.id()); }

    @DeleteMapping("/keys/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeKey(@AuthenticationPrincipal AuthUser u, @PathVariable UUID id) {
        keys.revoke(u.id(), id);
        audit.log(u.id(), "API_KEY_REVOKED", "api_key", id);
    }
}
