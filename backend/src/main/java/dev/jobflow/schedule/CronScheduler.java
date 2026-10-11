package dev.jobflow.schedule;

import dev.jobflow.queue.RedisJobQueue;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
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

/** Turns due schedules into normal jobs. FOR UPDATE SKIP LOCKED plus a per-tick idempotency key means many copies never double-fire. */
@Component
@Profile("!api")
public class CronScheduler {
    private static final Logger log = LoggerFactory.getLogger(CronScheduler.class);
    private record Due(UUID id, UUID owner, String type, String payload, String cron, String tz, Instant fireAt) {}
    private record Fired(UUID jobId, UUID ownerId, long scoreMs) {}

    private final JdbcTemplate j;
    private final TransactionTemplate tt;
    private final RedisJobQueue queue;

    public CronScheduler(JdbcTemplate j, PlatformTransactionManager tm, RedisJobQueue queue) { this.j = j; this.tt = new TransactionTemplate(tm); this.queue = queue; }

    @Scheduled(fixedDelay = 5000, initialDelay = 5000)
    public void tick() {
        try {
            List<Fired> fired = tt.execute(st -> {
                List<Due> due = j.query("""
                        select id, owner_id, job_type, payload::text, cron_expr, timezone, next_fire_at from schedules
                        where enabled and next_fire_at <= now() order by next_fire_at limit 50 for update skip locked""",
                        (rs, i) -> new Due(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4), rs.getString(5),
                                rs.getString(6), rs.getTimestamp(7).toInstant()));
                List<Fired> out = new ArrayList<>();
                for (Due d : due) {
                    UUID jobId = UUID.randomUUID();
                    boolean full = Boolean.TRUE.equals(j.queryForObject(
                            "select (select count(*) from jobs where owner_id = ? and status = 'QUEUED') >= (select max_queued from users where id = ?)", Boolean.class, d.owner(), d.owner()));
                    int n = full ? 0 : j.update("""
                            insert into jobs(id, owner_id, type, payload, status, priority, schedule_id, idempotency_key, next_run_at)
                            values (?,?,?,?::jsonb,'QUEUED',1,?,?,now()) on conflict (owner_id, idempotency_key) do nothing""",
                            jobId, d.owner(), d.type(), d.payload(), d.id(), "sched:" + d.id() + ":" + d.fireAt().getEpochSecond());
                    Instant next = null;
                    try { next = ScheduleService.next(d.cron(), d.tz(), Instant.now()); } catch (Exception e) { log.warn("bad cron on schedule {}", d.id()); }
                    j.update("update schedules set last_fire_at = now(), next_fire_at = ?, enabled = ? where id = ?",
                            next == null ? null : Timestamp.from(next), next != null, d.id());
                    if (n == 1) out.add(new Fired(jobId, d.owner(), System.currentTimeMillis()));
                }
                return out;
            });
            if (fired != null) for (Fired f : fired) {
                j.query("select priority from jobs where id = ?", rs -> { queue.enqueue(f.jobId(), f.ownerId(), rs.getInt(1), f.scoreMs()); }, f.jobId());
            }
        } catch (Exception e) { log.error("cron tick failed: {}", e.getMessage()); }
    }
}
