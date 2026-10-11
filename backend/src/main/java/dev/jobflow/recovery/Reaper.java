package dev.jobflow.recovery;

import dev.jobflow.common.LeaderLock;
import dev.jobflow.job.Job;
import dev.jobflow.job.JobRepo;
import dev.jobflow.queue.EventPublisher;
import dev.jobflow.queue.RedisJobQueue;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Finds RUNNING jobs whose lease expired (worker died) and re-queues them, or marks them DEAD when attempts are used up. */
@Component
@Profile("!api")
public class Reaper {
    private static final Logger log = LoggerFactory.getLogger(Reaper.class);
    private final LeaderLock leader;
    private final JobRepo repo;
    private final RedisJobQueue queue;
    private final EventPublisher events;
    private final MeterRegistry mx;
    private final dev.jobflow.worker.WebhookService webhooks;

    public Reaper(LeaderLock leader, JobRepo repo, RedisJobQueue queue, EventPublisher events, MeterRegistry mx, dev.jobflow.worker.WebhookService webhooks) {
        this.leader = leader; this.repo = repo; this.queue = queue; this.events = events; this.mx = mx; this.webhooks = webhooks;
    }

    @Scheduled(fixedDelay = 10000, initialDelay = 10000)
    public void reap() {
        try {
            var recovered = leader.runIfLeader("reaper", () -> {
                List<Job> out = new ArrayList<>();
                for (Job j : repo.lockExpired(100)) {
                    boolean dead = j.attempts() >= j.maxAttempts();
                    if (repo.recoverExpired(j.id(), dead) == 1) {
                        repo.insertExecution(j, j.workerId(), "LEASE_LOST", "Lease expired (worker lost)", j.startedAt() == null ? java.time.Instant.now() : j.startedAt());
                        out.add(dead ? withStatus(j, "DEAD") : withStatus(j, "QUEUED"));
                    }
                }
                return out;
            });
            // enqueue only after the transaction committed, so a worker never sees the id before the row says QUEUED
            recovered.ifPresent(list -> list.forEach(j -> {
                if (j.status().equals("QUEUED")) queue.enqueue(j.id(), j.ownerId(), j.priority(), System.currentTimeMillis());
                else if (j.status().equals("DEAD")) webhooks.enqueue(j, "DEAD");
                events.publish(j);
                mx.counter("reaper.recovered").increment();
                log.warn("reaper recovered job {} -> {}", j.id(), j.status());
            }));
        } catch (Exception e) { log.error("reaper failed: {}", e.getMessage()); }
    }

    private static Job withStatus(Job j, String s) {
        return new Job(j.id(), j.ownerId(), j.type(), j.payload(), s, j.priority(), j.attempts(), j.maxAttempts(), j.timeoutSeconds(), j.nextRunAt(), j.workerId(),
                j.leaseExpiresAt(), j.idempotencyKey(), j.scheduleId(), j.callbackUrl(), j.lastError(), j.result(), j.createdAt(), j.startedAt(), j.finishedAt(), j.updatedAt());
    }
}
