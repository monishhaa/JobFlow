package dev.jobflow.worker;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@Profile("!api")
public class WebhookDispatcher {
    private static final Logger log = LoggerFactory.getLogger(WebhookDispatcher.class);

    private record PendingDelivery(UUID id, UUID ownerId, String url, String body, int attempts) {}

    private final JdbcTemplate jdbc;
    private final WebhookService webhookService;
    private final TransactionTemplate tt;

    public WebhookDispatcher(JdbcTemplate jdbc, WebhookService webhookService, PlatformTransactionManager tm) {
        this.jdbc = jdbc;
        this.webhookService = webhookService;
        this.tt = new TransactionTemplate(tm);
    }

    @Scheduled(fixedDelay = 5000)
    public void dispatch() {
        try {
            tt.execute(status -> {
                List<PendingDelivery> batch = jdbc.query("""
                        select id, owner_id, url, body, attempts from webhook_deliveries
                        where status = 'PENDING' and next_attempt_at <= now()
                        order by next_attempt_at
                        limit 20
                        for update skip locked""",
                        (rs, i) -> new PendingDelivery(
                                rs.getObject("id", UUID.class),
                                rs.getObject("owner_id", UUID.class),
                                rs.getString("url"),
                                rs.getString("body"),
                                rs.getInt("attempts")));

                for (PendingDelivery d : batch) {
                    try {
                        webhookService.deliver(d.url(), d.body(), d.ownerId());
                        jdbc.update("update webhook_deliveries set status = 'DELIVERED' where id = ?", d.id());
                    } catch (Exception e) {
                        int nextAttempts = d.attempts() + 1;
                        String err = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                        if (err.length() > 500) err = err.substring(0, 500);

                        if (nextAttempts >= 8) {
                            jdbc.update("update webhook_deliveries set status = 'FAILED', attempts = ?, last_error = ? where id = ?",
                                    nextAttempts, err, d.id());
                        } else {
                            long delaySec = Math.min(3600L, 10L * (1L << d.attempts()));
                            Instant nextAt = Instant.now().plusSeconds(delaySec);
                            jdbc.update("update webhook_deliveries set attempts = ?, last_error = ?, next_attempt_at = ? where id = ?",
                                    nextAttempts, err, Timestamp.from(nextAt), d.id());
                        }
                    }
                }
                return null;
            });
        } catch (Exception e) {
            log.error("webhook dispatcher error: {}", e.getMessage());
        }
    }
}
