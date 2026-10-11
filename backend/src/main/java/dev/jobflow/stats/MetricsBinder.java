package dev.jobflow.stats;

import dev.jobflow.queue.RedisJobQueue;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class MetricsBinder implements MeterBinder {
    private final RedisJobQueue queue;
    private final JdbcTemplate j;

    public MetricsBinder(RedisJobQueue queue, JdbcTemplate j) { this.queue = queue; this.j = j; }

    @Override
    public void bindTo(MeterRegistry r) {
        for (int p = 0; p < 3; p++) {
            final int prio = p;
            Gauge.builder("queue.depth", () -> { try { return queue.depth(prio); } catch (Exception e) { return -1; } })
                    .tag("priority", RedisJobQueue.NAMES[p]).register(r);
        }
        Gauge.builder("workers.alive", () -> {
            try { return j.queryForObject("select count(*) from workers where last_heartbeat_at > now() - interval '30 seconds'", Long.class); }
            catch (Exception e) { return -1; }
        }).register(r);
    }
}
