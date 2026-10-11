package dev.jobflow.auth;

import dev.jobflow.common.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@Profile("!worker")
public class AuthController {
    public record Creds(@NotBlank @Email @Size(max = 255) String email, @NotBlank @Size(min = 8, max = 72) String password) {}

    private static final String COOKIE = "jf_refresh";
    private final AuthService auth;
    private final JwtService jwt;
    private final boolean secure;

    public AuthController(AuthService auth, JwtService jwt, @Value("${app.cookie-secure:true}") boolean secure) {
        this.auth = auth; this.jwt = jwt; this.secure = secure;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> register(@Valid @RequestBody Creds c) {
        UUID id = auth.register(c.email(), c.password());
        return Map.of("id", id, "email", c.email().trim().toLowerCase());
    }

    @PostMapping("/login")
    public Map<String, Object> login(@Valid @RequestBody Creds c, HttpServletRequest req, HttpServletResponse res) {
        return respond(auth.login(c.email(), c.password(), AuditService.clientIp() == null ? req.getRemoteAddr() : AuditService.clientIp()), res);
    }

    @PostMapping("/refresh")
    public Map<String, Object> refresh(@CookieValue(name = COOKIE, required = false) String raw, HttpServletResponse res) {
        return respond(auth.refresh(raw), res);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@CookieValue(name = COOKIE, required = false) String raw, HttpServletResponse res) {
        auth.logout(raw);
        res.addHeader(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString());
    }

    private Map<String, Object> respond(AuthService.Tokens t, HttpServletResponse res) {
        res.addHeader(HttpHeaders.SET_COOKIE, cookie(t.refresh(), Duration.ofSeconds(auth.refreshTtlSeconds())).toString());
        return Map.of("accessToken", t.access(), "expiresIn", jwt.ttlSeconds(),
                "user", Map.of("id", t.user().id(), "email", t.user().email(), "role", t.user().role()));
    }

    private ResponseCookie cookie(String v, Duration age) {
        return ResponseCookie.from(COOKIE, v).httpOnly(true).secure(secure).sameSite("Strict").path("/api/auth").maxAge(age).build();
    }
}
