package dev.jobflow.job;

import dev.jobflow.auth.AuthUser;
import dev.jobflow.common.Page;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/jobs")
@Profile("!worker")
public class JobController {
    private final JobService svc;

    public JobController(JobService svc) { this.svc = svc; }

    @PostMapping
    public ResponseEntity<Job> submit(@AuthenticationPrincipal AuthUser u, @Valid @RequestBody SubmitRequest r,
                                      @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        var s = svc.submit(u, r, key);
        return ResponseEntity.status(s.created() ? HttpStatus.CREATED : HttpStatus.OK).body(s.job());
    }

    @GetMapping
    public Page<Job> list(@AuthenticationPrincipal AuthUser u, @RequestParam(required = false) String status, @RequestParam(required = false) String type,
                          @RequestParam(required = false) String q, @RequestParam(required = false) Instant from, @RequestParam(required = false) Instant to,
                          @RequestParam(required = false) String sort, @RequestParam(defaultValue = "desc") String dir,
                          @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return svc.list(u, status, type, q, from, to, sort, dir.equalsIgnoreCase("asc"), page, size);
    }

    @GetMapping("/types")
    public List<String> types() { return svc.types(); }

    @GetMapping("/{id}")
    public Job get(@AuthenticationPrincipal AuthUser u, @PathVariable UUID id) { return svc.get(u, id); }

    @GetMapping("/{id}/executions")
    public List<Execution> executions(@AuthenticationPrincipal AuthUser u, @PathVariable UUID id) { return svc.executions(u, id); }

    @PostMapping("/{id}/cancel")
    public Job cancel(@AuthenticationPrincipal AuthUser u, @PathVariable UUID id) { return svc.cancel(u, id); }

    @PostMapping("/{id}/retry")
    public Job retry(@AuthenticationPrincipal AuthUser u, @PathVariable UUID id) { return svc.retry(u, id); }

    @PostMapping("/requeue-dead")
    public Map<String, Integer> requeueDead(@AuthenticationPrincipal AuthUser u) { return Map.of("requeued", svc.requeueDead(u)); }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthUser u, @PathVariable UUID id) { svc.delete(u, id); }
}
