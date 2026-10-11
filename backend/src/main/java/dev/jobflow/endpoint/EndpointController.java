package dev.jobflow.endpoint;

import dev.jobflow.auth.AuthUser;
import java.util.List;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/endpoints")
@Profile("!worker")
public class EndpointController {
    private final EndpointService service;

    public EndpointController(EndpointService service) {
        this.service = service;
    }

    @PostMapping
    public EndpointService.EndpointView create(@AuthenticationPrincipal AuthUser u, @RequestBody EndpointService.CreateRequest req) {
        return service.create(u, req);
    }

    @GetMapping
    public List<EndpointService.EndpointView> list(@AuthenticationPrincipal AuthUser u) {
        return service.list(u);
    }

    @DeleteMapping("/{id}")
    public void delete(@AuthenticationPrincipal AuthUser u, @PathVariable UUID id) {
        service.delete(u, id);
    }
}
