package dev.jobflow.admin;

import dev.jobflow.auth.AuthService;
import dev.jobflow.auth.AuthUser;
import dev.jobflow.common.ApiException;
import dev.jobflow.common.AuditService;
import dev.jobflow.common.Page;
import dev.jobflow.common.Tx;
import dev.jobflow.job.Job;
import dev.jobflow.job.JobRepo;
import dev.jobflow.queue.EventPublisher;
import dev.jobflow.queue.RedisJobQueue;
import dev.jobflow.user.UserRec;
import dev.jobflow.user.UserRepo;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Every read of other users' data and every change is written to the audit log. */
@RestController
@RequestMapping("/api/admin")
@Profile("!worker")
public class AdminController {
    public record UserPatch(@Pattern(regexp = "ACTIVE|DISABLED") String status, @Min(1) @Max(1000) Integer maxRunning,
                            @Min(1) @Max(1_000_000) Integer maxQueued, @Min(1) @Max(100_000) Integer rateLimitPerMin) {}

    private final UserRepo users;
    private final AuthService auth;
    private final AuditService audit;
    private final JdbcTemplate j;
    private final Tx tx;
    private final JobRepo jobs;
    private final RedisJobQueue queue;
    private final EventPublisher events;
    private final dev.jobflow.common.PayloadCrypto crypto;

    public AdminController(UserRepo users, AuthService auth, AuditService audit, JdbcTemplate j, Tx tx, JobRepo jobs, RedisJobQueue queue, EventPublisher events, dev.jobflow.common.PayloadCrypto crypto) {
        this.users = users; this.auth = auth; this.audit = audit; this.j = j; this.tx = tx; this.jobs = jobs; this.queue = queue; this.events = events; this.crypto = crypto;
    }

    private Job mask(Job j) {
        if (j == null) return null;
        return new Job(j.id(), j.ownerId(), j.type(), crypto.mask(j.type(), j.payload()), j.status(), j.priority(),
                j.attempts(), j.maxAttempts(), j.timeoutSeconds(), j.nextRunAt(), j.workerId(), j.leaseExpiresAt(),
                j.idempotencyKey(), j.scheduleId(), j.callbackUrl(), j.lastError(), j.result(), j.createdAt(),
                j.startedAt(), j.finishedAt(), j.updatedAt());
    }

    private static Map<String, Object> view(UserRec u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.id()); m.put("email", u.email()); m.put("role", u.role()); m.put("status", u.status());
        m.put("maxRunning", u.maxRunning()); m.put("maxQueued", u.maxQueued()); m.put("rateLimitPerMin", u.rateLimitPerMin()); m.put("createdAt", u.createdAt());
        return m;
    }

    @GetMapping("/users")
    public Page<Map<String, Object>> users(@AuthenticationPrincipal AuthUser a, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        int s = Math.max(1, Math.min(size, 100));
        audit.log(a.id(), "ADMIN_LIST_USERS", "user", null);
        return new Page<>(users.page(s, page * s).stream().map(AdminController::view).toList(), users.count(), page, s);
    }

    @PatchMapping("/users/{id}")
    public Map<String, Object> patchUser(@AuthenticationPrincipal AuthUser a, @PathVariable UUID id, @Valid @RequestBody UserPatch p) {
        if (id.equals(a.id()) && "DISABLED".equals(p.status())) throw ApiException.bad("You cannot disable your own account");
        if (users.updateAdmin(id, p.status(), p.maxRunning(), p.maxQueued(), p.rateLimitPerMin()) == 0) throw ApiException.notFound("User");
        if ("DISABLED".equals(p.status())) auth.revokeAll(id);
        audit.log(a.id(), "DISABLED".equals(p.status()) ? "ADMIN_USER_DISABLED" : "ADMIN_USER_UPDATED", "user", id);
        return view(users.byId(id).orElseThrow());
    }

    @GetMapping("/workers")
    public List<Map<String, Object>> workers(@AuthenticationPrincipal AuthUser a) {
        audit.log(a.id(), "ADMIN_LIST_WORKERS", "worker", null);
        return j.queryForList("select id, host, started_at as \"startedAt\", last_heartbeat_at as \"lastHeartbeatAt\", running_count as \"runningCount\", " +
                "extract(epoch from now() - last_heartbeat_at)::int as \"heartbeatAgeSec\", version from workers order by last_heartbeat_at desc");
    }

    @GetMapping("/queues")
    public Map<String, Object> queues(@AuthenticationPrincipal AuthUser a) {
        audit.log(a.id(), "ADMIN_VIEW_QUEUES", "queue", null);
        Map<String, Object> m = new LinkedHashMap<>();
        Map<String, Long> depth = new LinkedHashMap<>();
        for (int i = 0; i < 3; i++) depth.put(RedisJobQueue.NAMES[i], queue.depth(i));
        Map<String, Long> db = new LinkedHashMap<>();
        j.query("select status, count(*) from jobs group by status", rs -> { db.put(rs.getString(1), rs.getLong(2)); });
        m.put("redisDepth", depth);
        m.put("jobsByStatus", db);
        return m;
    }

    @GetMapping("/jobs")
    public Page<Job> jobs(@AuthenticationPrincipal AuthUser a, @RequestParam(required = false) UUID ownerId, @RequestParam(required = false) String status,
                          @RequestParam(required = false) String type, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        audit.log(a.id(), "ADMIN_LIST_JOBS", "job", ownerId);
        int s = Math.max(1, Math.min(size, 100));
        Page<Job> res = tx.asUser(a, () -> jobs.list(ownerId, status, type, null, null, null, null, false, Math.max(0, page), s));
        return new Page<>(res.items().stream().map(this::mask).toList(), res.total(), res.page(), res.size());
    }

    @PostMapping("/jobs/{id}/requeue")
    public Job requeue(@AuthenticationPrincipal AuthUser a, @PathVariable UUID id) {
        Job j0 = tx.asUser(a, () -> {
            Job cur = jobs.findAny(id).orElseThrow(() -> ApiException.notFound("Job"));
            if (jobs.adminRequeue(id) == 0) throw ApiException.conflict("Job cannot be requeued in its current state");
            return jobs.findAny(id).orElse(cur);
        });
        queue.enqueue(id, j0.ownerId(), j0.priority(), System.currentTimeMillis());
        events.publish(j0);
        audit.log(a.id(), "ADMIN_FORCE_REQUEUE", "job", id);
        return mask(j0);
    }
}
