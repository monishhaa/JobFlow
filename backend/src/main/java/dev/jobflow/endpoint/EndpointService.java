package dev.jobflow.endpoint;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.jobflow.auth.AuthUser;
import dev.jobflow.common.ApiException;
import dev.jobflow.common.PayloadCrypto;
import dev.jobflow.common.SsrfGuard;
import dev.jobflow.common.Tx;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
@Profile("!worker")
public class EndpointService {
    public record CreateRequest(String name, String url, String method, Map<String, String> headers) {}

    public record EndpointView(UUID id, String name, String url, String method, Map<String, String> headers, String createdAt) {}

    private final Tx tx;
    private final JdbcTemplate jdbc;
    private final SsrfGuard ssrf;
    private final PayloadCrypto crypto;
    private final ObjectMapper om;

    public EndpointService(Tx tx, JdbcTemplate jdbc, SsrfGuard ssrf, PayloadCrypto crypto, ObjectMapper om) {
        this.tx = tx;
        this.jdbc = jdbc;
        this.ssrf = ssrf;
        this.crypto = crypto;
        this.om = om;
    }

    public EndpointView create(AuthUser u, CreateRequest req) {
        if (req.name() == null || !req.name().matches("^[a-z0-9][a-z0-9_-]{0,39}$")) {
            throw ApiException.bad("name must match ^[a-z0-9][a-z0-9_-]{0,39}$");
        }
        if (req.url() == null || req.url().isBlank()) {
            throw ApiException.bad("url is required");
        }
        try {
            ssrf.parse(req.url());
        } catch (IllegalArgumentException e) {
            throw ApiException.bad("url: " + e.getMessage());
        }

        String method = req.method() == null || req.method().isBlank() ? "POST" : req.method().toUpperCase();
        if (!Set.of("POST", "PUT", "PATCH", "GET", "DELETE").contains(method)) {
            throw ApiException.bad("method must be POST, PUT, PATCH, GET, or DELETE");
        }

        String encHeaders = null;
        if (req.headers() != null && !req.headers().isEmpty()) {
            try {
                String headersJson = om.writeValueAsString(req.headers());
                encHeaders = crypto.encrypt(headersJson);
            } catch (Exception e) {
                throw ApiException.bad("Invalid headers");
            }
        }

        UUID id = UUID.randomUUID();
        String finalEncHeaders = encHeaders;
        return tx.asUser(u, () -> {
            Long count = jdbc.queryForObject("select count(*) from endpoints where owner_id = ?", Long.class, u.id());
            if (count != null && count >= 20) {
                throw ApiException.bad("Endpoint limit (20) reached");
            }
            try {
                jdbc.update("insert into endpoints(id, owner_id, name, url, method, headers) values (?,?,?,?,?,?)",
                        id, u.id(), req.name(), req.url(), method, finalEncHeaders);
            } catch (org.springframework.dao.DuplicateKeyException e) {
                throw ApiException.conflict("Endpoint with this name already exists");
            }
            return get(u, id);
        });
    }

    public List<EndpointView> list(AuthUser u) {
        return tx.asUser(u, () ->
            jdbc.query("select id, name, url, method, headers, created_at from endpoints where owner_id = ? order by created_at desc",
                    (rs, i) -> mapRow(rs), u.id())
        );
    }

    public EndpointView get(AuthUser u, UUID id) {
        return tx.asUser(u, () ->
            jdbc.query("select id, name, url, method, headers, created_at from endpoints where id = ? and owner_id = ?",
                    (rs, i) -> mapRow(rs), id, u.id()).stream().findFirst()
                    .orElseThrow(() -> ApiException.notFound("Endpoint"))
        );
    }

    public void delete(AuthUser u, UUID id) {
        tx.asUser(u, () -> {
            int n = jdbc.update("delete from endpoints where id = ? and owner_id = ?", id, u.id());
            if (n == 0) throw ApiException.notFound("Endpoint");
            return null;
        });
    }

    private EndpointView mapRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        UUID id = rs.getObject("id", UUID.class);
        String name = rs.getString("name");
        String url = rs.getString("url");
        String method = rs.getString("method");
        String encHeaders = rs.getString("headers");
        String createdAt = rs.getTimestamp("created_at") != null ? rs.getTimestamp("created_at").toInstant().toString() : null;

        Map<String, String> maskedHeaders = new LinkedHashMap<>();
        if (encHeaders != null && !encHeaders.isBlank()) {
            try {
                String plainJson = crypto.decrypt(encHeaders);
                Map<String, String> map = om.readValue(plainJson, new TypeReference<Map<String, String>>() {});
                for (String k : map.keySet()) {
                    maskedHeaders.put(k, "[hidden]");
                }
            } catch (Exception ignored) {}
        }
        return new EndpointView(id, name, url, method, maskedHeaders, createdAt);
    }
}
