package dev.jobflow.stats;

import dev.jobflow.auth.AuthUser;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api")
@Profile("!worker")
public class EventsController {
    private final EventHub hub;

    public EventsController(EventHub hub) { this.hub = hub; }

    /** The caller only ever gets their own channel. Browsers: use fetch-based SSE so the Authorization header can be sent. */
    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@AuthenticationPrincipal AuthUser u) { return hub.register(u.id()); }
}
