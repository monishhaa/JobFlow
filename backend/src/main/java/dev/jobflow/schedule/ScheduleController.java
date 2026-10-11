package dev.jobflow.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import dev.jobflow.auth.AuthUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/schedules")
@Profile("!worker")
public class ScheduleController {
    public record Create(@NotBlank String name, @NotBlank String cronExpr, String timezone, @NotBlank String jobType, JsonNode payload, Boolean enabled) {}
    public record Patch(String name, String cronExpr, String timezone, Boolean enabled, JsonNode payload) {}

    private final ScheduleService svc;

    public ScheduleController(ScheduleService svc) { this.svc = svc; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@AuthenticationPrincipal AuthUser u, @Valid @RequestBody Create r) {
        return svc.create(u, r.name(), r.cronExpr(), r.timezone(), r.jobType(), r.payload(), r.enabled() == null || r.enabled());
    }

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal AuthUser u) { return svc.list(u); }

    @GetMapping("/preview")
    public List<Instant> preview(@RequestParam String cron, @RequestParam(defaultValue = "UTC") String tz, @RequestParam(defaultValue = "5") int count) {
        return svc.preview(cron, tz, Math.min(Math.max(count, 1), 10));
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@AuthenticationPrincipal AuthUser u, @PathVariable UUID id) { return svc.get(u, id); }

    @PatchMapping("/{id}")
    public Map<String, Object> patch(@AuthenticationPrincipal AuthUser u, @PathVariable UUID id, @RequestBody Patch r) {
        return svc.patch(u, id, r.name(), r.cronExpr(), r.timezone(), r.enabled(), r.payload());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthUser u, @PathVariable UUID id) { svc.delete(u, id); }
}
