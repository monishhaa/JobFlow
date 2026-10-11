package dev.jobflow.auth;

import dev.jobflow.user.UserRepo;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Identity comes only from a verified JWT or API key. The user row is re-read so disabled users lose access at once. */
public class AuthFilter extends OncePerRequestFilter {
    private final JwtService jwt;
    private final ApiKeyService keys;
    private final UserRepo users;

    public AuthFilter(JwtService jwt, ApiKeyService keys, UserRepo users) { this.jwt = jwt; this.keys = keys; this.users = users; }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        try {
            String h = req.getHeader("Authorization");
            String key = req.getHeader("X-API-Key");
            Optional<UUID> id = Optional.empty();
            if (h != null && h.startsWith("Bearer ")) id = jwt.parse(h.substring(7));
            else if (key != null && !key.isBlank()) id = keys.authenticate(key);
            Optional<AuthUser> u = id.flatMap(users::activeAuth);
            if (u.isPresent()) {
                var a = new UsernamePasswordAuthenticationToken(u.get(), null, List.of(new SimpleGrantedAuthority("ROLE_" + u.get().role())));
                SecurityContextHolder.getContext().setAuthentication(a);
                MDC.put("ownerId", u.get().id().toString());
            }
        } catch (Exception ignored) {
            // unauthenticated request; the security chain will reject it if the path needs auth
        }
        chain.doFilter(req, res);
    }
}
