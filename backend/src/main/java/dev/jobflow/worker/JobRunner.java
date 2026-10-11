package dev.jobflow.worker;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.jobflow.job.Job;
import dev.jobflow.job.JobRepo;
import dev.jobflow.queue.EventPublisher;
import dev.jobflow.queue.RedisJobQueue;
import dev.jobflow.worker.handlers.JobHandler;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Runs one claimed job: heartbeat, timeout guard, fenced outcome write, execution history, events, callback. */
@Component
@Profile("!api")
public class JobRunner {
    private static final Logger log = LoggerFactory.getLogger(JobRunner.class);

    private final JobRepo repo;
    private final RedisJobQueue queue;
    private final EventPublisher events;
    private final WebhookService webhooks;
    private final Map<String, JobHandler> handlers;
    private final ObjectMapper om;
    private final MeterRegistry mx;
    private final int lease, hb, base, max;
    private final double jitter;
    final AtomicInteger running = new AtomicInteger();
    private final ScheduledExecutorService sched = Executors.newScheduledThreadPool(2, r -> { Thread t = new Thread(r, "job-guard"); t.setDaemon(true); return t; });

    public JobRunner(JobRepo repo, RedisJobQueue queue, EventPublisher events, WebhookService webhooks, List<JobHandler> hs, ObjectMapper om, MeterRegistry mx,
                     @Value("${app.worker.lease-seconds:30}") int lease, @Value("${app.worker.heartbeat-seconds:10}") int hb,
                     @Value("${app.retry.base-seconds:5}") int base, @Value("${app.retry.max-seconds:900}") int max,
                     @Value("${app.retry.jitter:0.2}") double jitter) {
        this.repo = repo; this.queue = queue; this.events = events; this.webhooks = webhooks; this.om = om; this.mx = mx;
        this.lease = lease; this.hb = hb; this.base = base; this.max = max; this.jitter = jitter;
        this.handlers = hs.stream().collect(Collectors.toMap(JobHandler::type, Function.identity()));
        Gauge.builder("jobs.running", running, AtomicInteger::get).register(mx);
    }

    public int runningCount() { return running.get(); }

    public void run(Job job, String wid, BooleanSupplier stopping) {
        MDC.put("jobId", job.id().toString()); MDC.put("ownerId", job.ownerId().toString()); MDC.put("workerId", wid); MDC.put("attempt", String.valueOf(job.attempts()));
        running.incrementAndGet();
        Instant started = Instant.now();
        Thread self = Thread.currentThread();
        AtomicBoolean leaseLost = new AtomicBoolean(), timedOut = new AtomicBoolean();
        AtomicBoolean stuckWarned = new AtomicBoolean();
        ScheduledFuture<?> beat = sched.scheduleAtFixedRate(() -> {
            try {
                if (Duration.between(started, Instant.now()).getSeconds() > job.timeoutSeconds() + 15) {
                    if (stuckWarned.compareAndSet(false, true)) {
                        log.warn("handler ignored timeout, letting lease expire");
                        mx.counter("jobs.stuck", "type", job.type()).increment();
                    }
                    return;
                }
                if (repo.heartbeat(job.id(), wid, job.attempts(), lease) == 0) { leaseLost.set(true); self.interrupt(); }
            } catch (Exception e) { log.warn("heartbeat failed: {}", e.getMessage()); }
        }, hb, hb, TimeUnit.SECONDS);
        ScheduledFuture<?> guard = sched.schedule(() -> { timedOut.set(true); self.interrupt(); }, job.timeoutSeconds(), TimeUnit.SECONDS);
        Object result = null;
        String error = null;
        boolean ok = false;
        try {
            Timer.builder("job.queue.wait").publishPercentileHistogram().register(mx)
                    .record(Duration.between(job.nextRunAt().isAfter(job.createdAt()) ? job.nextRunAt() : job.createdAt(), job.startedAt() == null ? Instant.now() : job.startedAt()).abs());
            JobHandler h = handlers.get(job.type());
            if (h == null) throw new IllegalStateException("No handler for " + job.type());
            result = h.execute(job.payload(), job.id());
            ok = true;
        } catch (Throwable e) {
            if (stopping.getAsBoolean() && !(e instanceof Error)) { beat.cancel(false); guard.cancel(false); Thread.interrupted(); running.decrementAndGet(); MDC.clear(); return; } // released by WorkerLoop
            error = timedOut.get() ? "Timeout after " + job.timeoutSeconds() + " s"
                    : leaseLost.get() ? "Lease lost" : trunc(e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage()));
        } finally {
            beat.cancel(false); guard.cancel(false); Thread.interrupted();
        }
        try {
            boolean applied; String finalStatus;
            if (ok) {
                applied = repo.succeed(job.id(), wid, job.attempts(), om.writeValueAsString(result == null ? Map.of() : result)) == 1;
                finalStatus = "SUCCEEDED";
            } else if (job.attempts() < job.maxAttempts()) {
                long delay = Backoff.delayMillis(job.attempts(), base, max, jitter, ThreadLocalRandom.current().nextDouble());
                Instant next = Instant.now().plusMillis(delay);
                applied = repo.retryLater(job.id(), wid, job.attempts(), next, error) == 1;
                if (applied) { queue.enqueue(job.id(), job.ownerId(), job.priority(), next.toEpochMilli()); mx.counter("job.retries").increment(); }
                finalStatus = "QUEUED";
            } else {
                applied = repo.dead(job.id(), wid, job.attempts(), error) == 1;
                finalStatus = "DEAD";
            }
            String execStatus = !applied ? "LEASE_LOST" : ok ? "SUCCEEDED" : timedOut.get() ? "TIMEOUT" : "FAILED";
            repo.insertExecution(job, wid, execStatus, applied ? error : "Result ignored: lease was lost (fenced)", started);
            if (!applied) { log.warn("fenced out, result ignored"); return; }
            if (!finalStatus.equals("QUEUED")) {
                mx.counter("jobs.finished", "type", job.type(), "status", finalStatus).increment();
                Timer.builder("job.duration").tag("type", job.type()).publishPercentileHistogram().register(mx).record(Duration.between(started, Instant.now()));
                webhooks.enqueue(job, finalStatus);
            }
            events.publish(job, finalStatus);
        } catch (Exception e) {
            log.error("could not record outcome; the reaper will recover the job: {}", e.getMessage());
        } finally {
            running.decrementAndGet();
            MDC.clear();
        }
    }

    private static String trunc(String s) { return s.length() > 1000 ? s.substring(0, 1000) : s; }
}
