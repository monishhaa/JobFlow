package dev.jobflow.worker;

import dev.jobflow.job.Job;
import dev.jobflow.job.JobRepo;
import dev.jobflow.queue.RedisJobQueue;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.net.InetAddress;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Claim loop: atomically pop an id from Redis, win the row in PostgreSQL, run it on the pool. Also registers and heartbeats the worker. */
@Component
@Profile("!api")
public class WorkerLoop {
    private static final Logger log = LoggerFactory.getLogger(WorkerLoop.class);

    private final RedisJobQueue queue;
    private final JobRepo repo;
    private final JobRunner runner;
    private final JdbcTemplate jdbc;
    private final int concurrency, lease, pollMs, shutdownWait;
    public final String workerId;
    private final Set<UUID> inFlight = ConcurrentHashMap.newKeySet();
    private volatile boolean running;
    private ThreadPoolExecutor pool;
    private Semaphore slots;
    private Thread poller;

    public WorkerLoop(RedisJobQueue queue, JobRepo repo, JobRunner runner, JdbcTemplate jdbc,
                      @Value("${app.worker.concurrency:8}") int concurrency, @Value("${app.worker.lease-seconds:30}") int lease,
                      @Value("${app.worker.poll-millis:300}") int pollMs, @Value("${app.worker.shutdown-wait-seconds:30}") int shutdownWait) {
        this.queue = queue; this.repo = repo; this.runner = runner; this.jdbc = jdbc;
        this.concurrency = concurrency; this.lease = lease; this.pollMs = pollMs; this.shutdownWait = shutdownWait;
        this.workerId = host() + "-" + UUID.randomUUID().toString().substring(0, 6);
    }

    private static String host() {
        try { return InetAddress.getLocalHost().getHostName(); } catch (Exception e) { return "worker"; }
    }

    @PostConstruct
    void start() {
        pool = new ThreadPoolExecutor(concurrency, concurrency, 0, TimeUnit.SECONDS, new SynchronousQueue<>(), r -> new Thread(r, "job-exec"));
        slots = new Semaphore(concurrency);
        running = true;
        poller = new Thread(this::loop, "claim-loop");
        poller.start();
        log.info("worker {} started with {} threads", workerId, concurrency);
    }

    private void loop() {
        while (running) {
            boolean handed = false;
            boolean acquired = false;
            try {
                if (!slots.tryAcquire()) { Thread.sleep(pollMs); continue; }
                acquired = true;
                String id = queue.claim(System.currentTimeMillis());
                if (id == null) { Thread.sleep(pollMs); continue; }
                UUID jid = UUID.fromString(id);
                Optional<Job> claimed = repo.claim(jid, workerId, lease);
                if (claimed.isEmpty()) { onNoClaim(jid); continue; }
                Job job = claimed.get();
                inFlight.add(jid);
                pool.execute(() -> {
                    try { runner.run(job, workerId, () -> !running); }
                    finally { inFlight.remove(jid); slots.release(); }
                });
                handed = true;
            } catch (InterruptedException ie) {
                break;
            } catch (Exception e) {
                log.error("claim loop error: {}", e.getMessage());
                try { Thread.sleep(1000); } catch (InterruptedException ie) { break; }
            } finally {
                if (acquired && !handed) slots.release();
            }
        }
    }

    /** Claim UPDATE matched nothing: cancelled/finished (drop) or the owner is at the running cap (try again in 2 s). */
    private void onNoClaim(UUID id) {
        repo.findAny(id).filter(j -> j.status().equals("QUEUED"))
                .ifPresent(j -> queue.enqueue(j.id(), j.ownerId(), j.priority(), System.currentTimeMillis() + 2000));
    }

    @Scheduled(fixedDelay = 10000)
    void register() {
        try {
            jdbc.update("""
                    insert into workers(id, host, running_count, version) values (?,?,?,?)
                    on conflict (id) do update set last_heartbeat_at = now(), running_count = excluded.running_count""",
                    workerId, host(), runner.runningCount(), "1.0.0");
        } catch (Exception e) { log.warn("worker registration failed: {}", e.getMessage()); }
    }

    /** SIGTERM: stop claiming, wait for running jobs, then hand anything unfinished back to the queue. */
    @PreDestroy
    void stop() {
        running = false;
        if (poller != null) poller.interrupt();
        if (pool == null) return;
        pool.shutdown();
        try {
            if (!pool.awaitTermination(shutdownWait, TimeUnit.SECONDS)) {
                log.warn("{} jobs still running after {} s, releasing them", inFlight.size(), shutdownWait);
                pool.shutdownNow();
                pool.awaitTermination(3, TimeUnit.SECONDS);
                for (UUID id : inFlight) repo.release(id, workerId).ifPresent(r -> queue.enqueue(id, r.ownerId(), r.priority(), System.currentTimeMillis()));
            }
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        try { jdbc.update("delete from workers where id = ?", workerId); } catch (Exception ignored) { }
    }
}
