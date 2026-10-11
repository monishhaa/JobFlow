package dev.jobflow.recovery;

import dev.jobflow.common.LeaderLock;
import dev.jobflow.job.JobRepo;
import dev.jobflow.queue.RedisJobQueue;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** QUEUED jobs that are missing from Redis (Redis restart, crash between DB commit and enqueue) are added back with ZADD NX. */
@Component
@Profile("!api")
public class Reconciler {
    private static final Logger log = LoggerFactory.getLogger(Reconciler.class);
    private final LeaderLock leader;
    private final JobRepo repo;
    private final RedisJobQueue queue;
    private final MeterRegistry mx;

    public Reconciler(LeaderLock leader, JobRepo repo, RedisJobQueue queue, MeterRegistry mx) { this.leader = leader; this.repo = repo; this.queue = queue; this.mx = mx; }

    @Scheduled(fixedDelay = 30000, initialDelay = 15000)
    public void reconcile() {
        try {
            leader.runIfLeader("reconciler", () -> {
                int added = 0;
                for (var j : repo.staleQueued(5000)) {
                    if (queue.addIfAbsent(j.id(), j.ownerId(), j.priority(), j.nextRunAt().toEpochMilli())) added++;
                }
                if (added > 0) { mx.counter("reconciler.readded").increment(added); log.warn("reconciler re-added {} jobs to Redis", added); }
                return added;
            });
        } catch (Exception e) { log.error("reconciler failed: {}", e.getMessage()); }
    }
}
