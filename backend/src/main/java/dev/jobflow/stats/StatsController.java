package dev.jobflow.stats;

import dev.jobflow.auth.AuthUser;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stats")
@Profile("!worker")
public class StatsController {
    private final StatsService svc;

    public StatsController(StatsService svc) { this.svc = svc; }

    @GetMapping("/summary")
    public Map<String, Object> summary(@AuthenticationPrincipal AuthUser u) { return svc.summary(u); }

    @GetMapping("/timeseries")
    public List<Map<String, Object>> timeseries(@AuthenticationPrincipal AuthUser u, @RequestParam(defaultValue = "24h") String range) { return svc.timeseries(u, range); }
}
