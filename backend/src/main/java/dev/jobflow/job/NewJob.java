package dev.jobflow.job;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;

public record NewJob(UUID id, UUID ownerId, String type, JsonNode payload, int priority, int maxAttempts, int timeoutSeconds,
                     Instant nextRunAt, String idempotencyKey, UUID scheduleId, String callbackUrl) {}
