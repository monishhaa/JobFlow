package dev.jobflow.queue;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.jobflow.job.Job;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/** Publishes job updates to the per-user channel events:{ownerId}. Best effort. */
@Component
public class EventPublisher {
    private static final Logger log = LoggerFactory.getLogger(EventPublisher.class);
    private final StringRedisTemplate redis;
    private final ObjectMapper om;

    public EventPublisher(StringRedisTemplate redis, ObjectMapper om) { this.redis = redis; this.om = om; }

    public void publish(Job j) {
        try {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("jobId", j.id());
            m.put("type", j.type());
            m.put("status", j.status());
            m.put("attempts", j.attempts());
            m.put("maxAttempts", j.maxAttempts());
            m.put("at", Instant.now());
            redis.convertAndSend("events:" + j.ownerId(), om.writeValueAsString(m));
        } catch (Exception e) {
            log.debug("event publish failed: {}", e.getMessage());
        }
    }

    public void publish(Job j, String status) {
        publish(new Job(j.id(), j.ownerId(), j.type(), j.payload(), status, j.priority(), j.attempts(), j.maxAttempts(), j.timeoutSeconds(),
                j.nextRunAt(), j.workerId(), j.leaseExpiresAt(), j.idempotencyKey(), j.scheduleId(), j.callbackUrl(), j.lastError(),
                j.result(), j.createdAt(), j.startedAt(), j.finishedAt(), j.updatedAt()));
    }
}
