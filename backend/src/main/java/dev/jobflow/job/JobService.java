package dev.jobflow.job;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.jobflow.auth.AuthUser;
import dev.jobflow.common.*;
import dev.jobflow.queue.EventPublisher;
import dev.jobflow.queue.RedisJobQueue;
import dev.jobflow.user.UserRec;
import dev.jobflow.user.UserRepo;
import dev.jobflow.worker.handlers.JobHandler;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

@Service
public class JobService {
    public record Submitted(Job job, boolean created) {}

    private final Tx tx;
    private final JobRepo repo;
    private final UserRepo users;
    private final RedisJobQueue queue;
    private final RateLimiter rl;
    private final EventPublisher events;
    private final Map<String, JobHandler> handlers;
    private final ObjectMapper om;
    private final MeterRegistry mx;
    private final SsrfGuard ssrf;
    private final int maxPayload;
    private final int maxHighPrioQueued;
    private final PayloadCrypto crypto;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    public JobService(Tx tx, JobRepo repo, UserRepo users, RedisJobQueue queue, RateLimiter rl, EventPublisher events, List<JobHandler> hs,
                      ObjectMapper om, MeterRegistry mx, SsrfGuard ssrf, PayloadCrypto crypto, org.springframework.jdbc.core.JdbcTemplate jdbc,
                      @Value("${app.limits.max-payload-bytes:65536}") int maxPayload,
                      @Value("${app.limits.max-high-priority-queued:20}") int maxHighPrioQueued) {
        this.tx = tx; this.repo = repo; this.users = users; this.queue = queue; this.rl = rl; this.events = events; this.om = om; this.mx = mx;
        this.ssrf = ssrf; this.crypto = crypto; this.jdbc = jdbc; this.maxPayload = maxPayload; this.maxHighPrioQueued = maxHighPrioQueued;
        this.handlers = hs.stream().collect(Collectors.toMap(JobHandler::type, Function.identity()));
    }

    private Job mask(Job j) {
        if (j == null) return null;
        return new Job(j.id(), j.ownerId(), j.type(), crypto.mask(j.type(), j.payload()), j.status(), j.priority(),
                j.attempts(), j.maxAttempts(), j.timeoutSeconds(), j.nextRunAt(), j.workerId(), j.leaseExpiresAt(),
                j.idempotencyKey(), j.scheduleId(), j.callbackUrl(), j.lastError(), j.result(), j.createdAt(),
                j.startedAt(), j.finishedAt(), j.updatedAt());
    }

    public static int priorityOf(String p) {
        if (p == null || p.isBlank()) return 1;
        return switch (p.toUpperCase()) {
            case "HIGH" -> 0;
            case "NORMAL" -> 1;
            case "LOW" -> 2;
            default -> throw ApiException.bad("priority must be HIGH, NORMAL or LOW");
        };
    }

    public List<String> types() { return handlers.keySet().stream().sorted().toList(); }

    public JsonNode validatePayload(String type, JsonNode payload) {
        JobHandler h = handlers.get(type == null ? "" : type.toUpperCase());
        if (h == null) throw ApiException.bad("Unknown job type: " + type);
        JsonNode p = payload == null || payload.isNull() ? om.createObjectNode() : payload;
        if (!p.isObject()) throw ApiException.bad("payload must be a JSON object");
        try {
            if (om.writeValueAsBytes(p).length > maxPayload) throw new ApiException(413, "PAYLOAD_TOO_LARGE", "Payload exceeds " + maxPayload + " bytes");
            h.validate(p);
        } catch (IllegalArgumentException e) {
            throw ApiException.bad(e.getMessage());
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw ApiException.bad("Invalid payload");
        }
        return p;
    }

    public Submitted submit(AuthUser u, SubmitRequest r, String idemKey) {
        if (idemKey != null && (idemKey.isBlank() || idemKey.length() > 100)) throw ApiException.bad("Idempotency-Key must be 1 to 100 characters");
        UserRec ur = users.byId(u.id()).orElseThrow(() -> ApiException.notFound("User"));
        rl.hit("rl:" + u.id() + ":submit", ur.rateLimitPerMin(), 60);
        String type = r.type().toUpperCase();
        JsonNode payload = validatePayload(type, r.payload());
        int prio = priorityOf(r.priority());
        int maxAtt = r.maxAttempts() == null ? 5 : r.maxAttempts();
        int timeout = r.timeoutSeconds() == null ? 60 : r.timeoutSeconds();
        if (maxAtt < 1 || maxAtt > 10) throw ApiException.bad("maxAttempts must be between 1 and 10");
        if (timeout < 1 || timeout > 3600) throw ApiException.bad("timeoutSeconds must be between 1 and 3600");
        if (r.callbackUrl() != null) {
            try { ssrf.parse(r.callbackUrl()); } catch (IllegalArgumentException e) { throw ApiException.bad("callbackUrl: " + e.getMessage()); }
        }
        Instant runAt = r.runAt() == null || r.runAt().isBefore(Instant.now()) ? Instant.now() : r.runAt();
        UUID id = UUID.randomUUID();
        Submitted res;
        try {
            res = tx.asUser(u, () -> {
                if (idemKey != null) {
                    var ex = repo.findByIdem(u.id(), idemKey);
                    if (ex.isPresent()) return same(ex.get(), type, payload);
                }
                if ("CALL_ENDPOINT".equals(type)) {
                    String epName = payload.path("endpoint").asText();
                    Long epCount = jdbc.queryForObject("select count(*) from endpoints where owner_id = ? and name = ?", Long.class, u.id(), epName);
                    if (epCount == null || epCount == 0) {
                        throw ApiException.bad("Unknown endpoint");
                    }
                }
                if (repo.count(u.id(), "QUEUED") >= ur.maxQueued()) throw new ApiException(429, "QUEUE_FULL", "Too many queued jobs", 30);
                if (prio == 0 && !"ADMIN".equals(u.role()) && repo.countQueuedByPriority(u.id(), 0) >= maxHighPrioQueued)
                    throw new ApiException(429, "HIGH_PRIORITY_LIMIT", "Too many queued high-priority jobs", 30);
                JsonNode storedPayload = crypto.protect(type, payload);
                repo.insert(new NewJob(id, u.id(), type, storedPayload, prio, maxAtt, timeout, runAt, idemKey, null, r.callbackUrl()));
                return new Submitted(repo.findByIdAndOwner(id, u.id()).orElseThrow(), true);
            });
        } catch (DuplicateKeyException dup) { // two identical requests raced
            res = tx.asUser(u, () -> same(repo.findByIdem(u.id(), idemKey).orElseThrow(), type, payload));
        }
        if (res.created()) {
            queue.enqueue(res.job().id(), u.id(), prio, runAt.toEpochMilli());
            events.publish(res.job());
            mx.counter("jobs.submitted", "type", type).increment();
        }
        return new Submitted(mask(res.job()), res.created());
    }

    private Submitted same(Job ex, String type, JsonNode payload) {
        if (!ex.type().equals(type) || !crypto.mask(type, ex.payload()).equals(crypto.mask(type, payload)))
            throw new ApiException(422, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used with a different request");
        return new Submitted(ex, false);
    }

    public Job get(AuthUser u, UUID id) { return mask(tx.asUser(u, () -> repo.findByIdAndOwner(id, u.id()).orElseThrow(() -> ApiException.notFound("Job")))); }

    public Page<Job> list(AuthUser u, String status, String type, String q, Instant from, Instant to, String sort, boolean asc, int page, int size) {
        int s = Math.max(1, Math.min(size, 100)), p = Math.max(0, page);
        Page<Job> res = tx.asUser(u, () -> repo.list(u.id(), status, type, q, from, to, sort, asc, p, s));
        return new Page<>(res.items().stream().map(this::mask).toList(), res.total(), res.page(), res.size());
    }

    public List<Execution> executions(AuthUser u, UUID id) {
        return tx.asUser(u, () -> {
            repo.findByIdAndOwner(id, u.id()).orElseThrow(() -> ApiException.notFound("Job"));
            return repo.executions(id, u.id());
        });
    }

    public Job cancel(AuthUser u, UUID id) {
        Job j = tx.asUser(u, () -> {
            repo.findByIdAndOwner(id, u.id()).orElseThrow(() -> ApiException.notFound("Job"));
            if (repo.cancel(id, u.id()) == 0) throw ApiException.conflict("Only queued jobs can be cancelled");
            return repo.findByIdAndOwner(id, u.id()).orElseThrow();
        });
        queue.remove(id, u.id(), j.priority());
        events.publish(j);
        return mask(j);
    }

    public Job retry(AuthUser u, UUID id) {
        Job j = tx.asUser(u, () -> {
            repo.findByIdAndOwner(id, u.id()).orElseThrow(() -> ApiException.notFound("Job"));
            if (repo.retryTerminal(id, u.id()) == 0 && repo.retryNow(id, u.id()) == 0) throw ApiException.conflict("Job cannot be retried in its current state");
            return repo.findByIdAndOwner(id, u.id()).orElseThrow();
        });
        queue.enqueue(id, u.id(), j.priority(), System.currentTimeMillis());
        events.publish(j);
        return mask(j);
    }

    public int requeueDead(AuthUser u) {
        List<Job> js = tx.asUser(u, () -> repo.requeueDead(u.id()));
        long now = System.currentTimeMillis();
        js.forEach(j -> { queue.enqueue(j.id(), u.id(), j.priority(), now); events.publish(j); });
        return js.size();
    }

    public void delete(AuthUser u, UUID id) {
        tx.asUser(u, () -> {
            repo.findByIdAndOwner(id, u.id()).orElseThrow(() -> ApiException.notFound("Job"));
            if (repo.deleteFinished(id, u.id()) == 0) throw ApiException.conflict("Only finished jobs can be deleted");
            return null;
        });
    }
}
