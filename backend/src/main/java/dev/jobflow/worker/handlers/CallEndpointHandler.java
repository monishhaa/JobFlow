package dev.jobflow.worker.handlers;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.jobflow.common.PayloadCrypto;
import dev.jobflow.common.SsrfGuard;
import dev.jobflow.user.UserRepo;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class CallEndpointHandler implements JobHandler {
    private static final int MAX_BODY = 65536;
    private final SsrfGuard ssrf;
    private final PayloadCrypto crypto;
    private final JdbcTemplate jdbc;
    private final UserRepo users;
    private final ObjectMapper om;
    private final HttpClient client = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public CallEndpointHandler(SsrfGuard ssrf, PayloadCrypto crypto, JdbcTemplate jdbc, UserRepo users, ObjectMapper om) {
        this.ssrf = ssrf;
        this.crypto = crypto;
        this.jdbc = jdbc;
        this.users = users;
        this.om = om;
    }

    @Override
    public String type() {
        return "CALL_ENDPOINT";
    }

    @Override
    public void validate(JsonNode p) {
        String ep = JobHandler.need(p, "endpoint").asText();
        if (!ep.matches("^[a-z0-9][a-z0-9_-]{0,39}$")) {
            throw new IllegalArgumentException("payload.endpoint must match ^[a-z0-9][a-z0-9_-]{0,39}$");
        }
        if (p.has("data") && !p.get("data").isNull() && !p.get("data").isObject()) {
            throw new IllegalArgumentException("payload.data must be a JSON object");
        }
    }

    private record EndpointRecord(String url, String method, String encHeaders) {}

    @Override
    public Object execute(JsonNode p, UUID jobId) throws Exception {
        String epName = p.get("endpoint").asText();
        JsonNode data = p.get("data");

        // 1. Look up owner_id and attempts from jobs table
        var jobRows = jdbc.query("select owner_id, attempts from jobs where id = ?",
                (rs, i) -> Map.entry(rs.getObject(1, UUID.class), rs.getInt(2)), jobId);
        if (jobRows.isEmpty()) {
            throw new IllegalStateException("Job not found: " + jobId);
        }
        UUID ownerId = jobRows.get(0).getKey();
        int attempt = jobRows.get(0).getValue();

        // 2. Look up endpoint by (owner_id, name)
        var epRows = jdbc.query("select url, method, headers from endpoints where owner_id = ? and name = ?",
                (rs, i) -> new EndpointRecord(rs.getString("url"), rs.getString("method"), rs.getString("headers")),
                ownerId, epName);
        if (epRows.isEmpty()) {
            throw new IllegalStateException("Endpoint was deleted");
        }
        EndpointRecord ep = epRows.get(0);

        // 3. Build request body: {"jobId":..., "attempt":..., "data": ...}
        Map<String, Object> bodyMap = new LinkedHashMap<>();
        bodyMap.put("jobId", jobId.toString());
        bodyMap.put("attempt", attempt);
        if (data != null && !data.isNull()) {
            bodyMap.put("data", data);
        }
        String body = om.writeValueAsString(bodyMap);

        // 4. Compute HMAC-SHA256 signature
        String secret = users.byId(ownerId).map(u -> u.webhookSecret()).orElse("");
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sig = HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));

        // 5. Decrypt stored headers
        Map<String, String> userHeaders = new LinkedHashMap<>();
        if (ep.encHeaders() != null && !ep.encHeaders().isBlank()) {
            try {
                String plainHeadersJson = crypto.decrypt(ep.encHeaders());
                userHeaders = om.readValue(plainHeadersJson, new TypeReference<Map<String, String>>() {});
            } catch (Exception ignored) {}
        }

        String method = ep.method() == null ? "POST" : ep.method().toUpperCase();
        URI uri = ssrf.check(ep.url());

        for (int hop = 0; hop <= 3; hop++) {
            HttpRequest.Builder rb = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20));
            rb.method(method, HttpRequest.BodyPublishers.ofString(body));

            // Add user headers first (excluding host, content-length, connection and X-Jobflow-*)
            for (Map.Entry<String, String> entry : userHeaders.entrySet()) {
                String k = entry.getKey();
                String kl = k.toLowerCase();
                if (!kl.equals("host") && !kl.equals("content-length") && !kl.equals("connection")
                        && !kl.startsWith("x-jobflow-") && !kl.equals("idempotency-key")) {
                    rb.header(k, entry.getValue());
                }
            }

            // Required standard headers (override any user header collision)
            rb.header("Content-Type", "application/json");
            rb.header("X-Jobflow-Job-Id", jobId.toString());
            rb.header("Idempotency-Key", jobId.toString());
            rb.header("X-Jobflow-Signature", "sha256=" + sig);

            HttpResponse<InputStream> res = client.send(rb.build(), HttpResponse.BodyHandlers.ofInputStream());
            String responseStr;
            try (InputStream in = res.body()) {
                byte[] bytes = in.readNBytes(MAX_BODY);
                responseStr = new String(bytes, StandardCharsets.UTF_8);
            }
            if (responseStr.length() > 2000) {
                responseStr = responseStr.substring(0, 2000);
            }

            int sc = res.statusCode();
            if (sc >= 300 && sc < 400 && res.headers().firstValue("location").isPresent()) {
                uri = ssrf.check(uri.resolve(res.headers().firstValue("location").get()).toString());
                continue;
            }

            if (sc < 200 || sc >= 300) {
                throw new IllegalStateException("HTTP " + sc + " from endpoint");
            }

            return Map.of("status", sc, "response", responseStr);
        }

        throw new IllegalStateException("Too many redirects");
    }
}
