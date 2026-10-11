package dev.jobflow.worker;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.jobflow.common.SsrfGuard;
import dev.jobflow.job.Job;
import dev.jobflow.user.UserRepo;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Enqueues webhooks durably into webhook_deliveries, and executes deliveries with HMAC signing and SSRF protection. */
@Service
public class WebhookService {
    private static final Logger log = LoggerFactory.getLogger(WebhookService.class);
    private final SsrfGuard ssrf;
    private final UserRepo users;
    private final ObjectMapper om;
    private final JdbcTemplate jdbc;
    private final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(Duration.ofSeconds(5)).build();

    public WebhookService(SsrfGuard ssrf, UserRepo users, ObjectMapper om, JdbcTemplate jdbc) {
        this.ssrf = ssrf;
        this.users = users;
        this.om = om;
        this.jdbc = jdbc;
    }

    public void enqueue(Job job, String status) {
        if (job.callbackUrl() == null || job.callbackUrl().isBlank()) return;
        try {
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("jobId", job.id());
            b.put("type", job.type());
            b.put("status", status);
            b.put("attempts", job.attempts());
            String body = om.writeValueAsString(b);

            jdbc.update("insert into webhook_deliveries(job_id, owner_id, url, body) values (?,?,?,?)",
                    job.id(), job.ownerId(), job.callbackUrl(), body);
        } catch (Exception e) {
            log.warn("failed to enqueue webhook for job {}: {}", job.id(), e.getMessage());
        }
    }

    public void deliver(String url, String body, UUID ownerId) throws Exception {
        URI uri = ssrf.check(url);
        String secret = users.byId(ownerId).map(u -> u.webhookSecret()).orElse("");
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(), "HmacSHA256"));
        String sig = HexFormat.of().formatHex(mac.doFinal(body.getBytes()));
        HttpResponse<Void> r = client.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json").header("X-Jobflow-Signature", "sha256=" + sig)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.discarding());
        int sc = r.statusCode();
        if (sc < 200 || sc >= 300) {
            throw new IllegalStateException("HTTP " + sc + " from webhook endpoint");
        }
    }
}
