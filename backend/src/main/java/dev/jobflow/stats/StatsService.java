package dev.jobflow.stats;

import dev.jobflow.auth.AuthUser;
import dev.jobflow.common.ApiException;
import dev.jobflow.common.RateLimiter;
import dev.jobflow.common.Tx;
import dev.jobflow.job.JobRepo;
import dev.jobflow.user.UserRec;
import dev.jobflow.user.UserRepo;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class StatsService {
    private final Tx tx;
    private final JdbcTemplate j;
    private final JobRepo jobs;
    private final UserRepo users;
    private final RateLimiter rl;

    public StatsService(Tx tx, JdbcTemplate j, JobRepo jobs, UserRepo users, RateLimiter rl) {
        this.tx = tx; this.j = j; this.jobs = jobs; this.users = users; this.rl = rl;
    }

    public Map<String, Object> usage(AuthUser u, UserRec ur) {
        long running = tx.asUser(u, () -> jobs.count(u.id(), "RUNNING"));
        long queued = tx.asUser(u, () -> jobs.count(u.id(), "QUEUED"));
        return Map.of("running", running, "maxRunning", ur.maxRunning(), "queued", queued, "maxQueued", ur.maxQueued(),
                "requestsThisMinute", rl.current("rl:" + u.id() + ":submit"), "rateLimitPerMin", ur.rateLimitPerMin());
    }

    public Map<String, Object> summary(AuthUser u) {
        UserRec ur = users.byId(u.id()).orElseThrow(() -> ApiException.notFound("User"));
        return tx.asUser(u, () -> {
            Map<String, Long> by = new LinkedHashMap<>();
            for (String s : List.of("QUEUED", "RUNNING", "SUCCEEDED", "DEAD", "CANCELLED")) by.put(s, 0L);
            j.query("select status, count(*) c from jobs where owner_id = ? group by status", rs -> { by.put(rs.getString(1), rs.getLong(2)); }, u.id());
            long retrying = j.queryForObject("select count(*) from jobs where owner_id = ? and status='QUEUED' and attempts > 0", Long.class, u.id());
            Map<String, Object> d = j.queryForMap("""
                    select count(*) filter (where status='SUCCEEDED') ok, count(*) filter (where status='DEAD') dead,
                    coalesce(avg(extract(epoch from finished_at - started_at) * 1000) filter (where status='SUCCEEDED'), 0) avg_ms
                    from jobs where owner_id = ? and finished_at > now() - interval '24 hours'""", u.id());
            long ok = ((Number) d.get("ok")).longValue(), dead = ((Number) d.get("dead")).longValue();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("counts", by);
            m.put("retrying", retrying);
            m.put("succeeded24h", ok);
            m.put("dead24h", dead);
            m.put("successRate24h", ok + dead == 0 ? null : (double) ok / (ok + dead));
            m.put("avgDurationMs", ((Number) d.get("avg_ms")).doubleValue());
            m.put("usage", Map.of("running", by.get("RUNNING"), "maxRunning", ur.maxRunning(), "queued", by.get("QUEUED"), "maxQueued", ur.maxQueued(),
                    "requestsThisMinute", rl.current("rl:" + u.id() + ":submit"), "rateLimitPerMin", ur.rateLimitPerMin()));
            return m;
        });
    }

    public List<Map<String, Object>> timeseries(AuthUser u, String range) {
        String r = range == null ? "24h" : range;
        Duration span; String unit;
        switch (r) {
            case "1h" -> { span = Duration.ofHours(1); unit = "minute"; }
            case "7d" -> { span = Duration.ofDays(7); unit = "day"; }
            case "24h" -> { span = Duration.ofHours(24); unit = "hour"; }
            default -> throw ApiException.bad("range must be 1h, 24h or 7d");
        }
        return tx.asUser(u, () -> j.queryForList("select date_trunc('" + unit + "', finished_at) as t, " +
                "count(*) filter (where status='SUCCEEDED') as succeeded, count(*) filter (where status='DEAD') as failed " +
                "from jobs where owner_id = ? and finished_at >= ? and status in ('SUCCEEDED','DEAD') group by 1 order by 1",
                u.id(), Timestamp.from(Instant.now().minus(span))));
    }
}
