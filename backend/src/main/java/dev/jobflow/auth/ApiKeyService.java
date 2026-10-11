package dev.jobflow.auth;

import dev.jobflow.common.ApiException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ApiKeyService {
    private final JdbcTemplate j;

    public ApiKeyService(JdbcTemplate j) { this.j = j; }

    public record Created(UUID id, String name, String prefix, String key) {}

    public Created create(UUID owner, String name) {
        String raw = "jf_" + Hashing.randomToken(32);
        UUID id = UUID.randomUUID();
        String prefix = raw.substring(0, 10);
        j.update("insert into api_keys(id, owner_id, name, key_prefix, key_hash) values (?,?,?,?,?)", id, owner, name, prefix, Hashing.sha256(raw));
        return new Created(id, name, prefix, raw);
    }

    public List<Map<String, Object>> list(UUID owner) {
        return j.queryForList("select id, name, key_prefix as prefix, last_used_at as \"lastUsedAt\", revoked_at as \"revokedAt\", created_at as \"createdAt\" from api_keys where owner_id = ? order by created_at desc", owner);
    }

    public void revoke(UUID owner, UUID id) {
        if (j.update("update api_keys set revoked_at = now() where id = ? and owner_id = ? and revoked_at is null", id, owner) == 0)
            throw ApiException.notFound("API key");
    }

    /** Returns the owner id for a valid, non-revoked key and records the use. */
    public Optional<UUID> authenticate(String raw) {
        List<UUID> r = j.query("select owner_id from api_keys where key_hash = ? and revoked_at is null",
                (rs, i) -> rs.getObject(1, UUID.class), Hashing.sha256(raw));
        if (r.isEmpty()) return Optional.empty();
        j.update("update api_keys set last_used_at = now() where key_hash = ? and (last_used_at is null or last_used_at < now() - interval '1 minute')", Hashing.sha256(raw));
        return Optional.of(r.get(0));
    }
}
