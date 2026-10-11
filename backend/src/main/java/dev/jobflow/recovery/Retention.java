package dev.jobflow.recovery;

import dev.jobflow.common.LeaderLock;
import dev.jobflow.job.JobRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Profile("!api")
public class Retention {
    private static final Logger log = LoggerFactory.getLogger(Retention.class);
    private final LeaderLock leader;
    private final JobRepo repo;
    private final JdbcTemplate jdbc;
    private final int days;

    public Retention(LeaderLock leader, JobRepo repo, JdbcTemplate jdbc, @Value("${app.retention.finished-days:30}") int days) {
        this.leader = leader; this.repo = repo; this.jdbc = jdbc; this.days = days;
    }

    @Scheduled(fixedDelay = 3_600_000, initialDelay = 60_000)
    public void purge() {
        try {
            leader.runIfLeader("retention", () -> {
                int n = repo.deleteOlderThan(days);
                jdbc.update("delete from workers where last_heartbeat_at < now() - interval '1 day'");
                jdbc.update("delete from refresh_tokens where expires_at < now() - interval '1 day'");
                jdbc.update("delete from audit_log where created_at < now() - interval '180 days'");
                jdbc.update("delete from webhook_deliveries where status <> 'PENDING' and created_at < now() - interval '7 days'");
                if (n > 0) log.info("retention removed {} finished jobs", n);
                return n;
            });
        } catch (Exception e) { log.error("retention failed: {}", e.getMessage()); }
    }
}
