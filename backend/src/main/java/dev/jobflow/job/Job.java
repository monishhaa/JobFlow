package dev.jobflow.job;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;

public record Job(UUID id, UUID ownerId, String type, JsonNode payload, String status, int priority, int attempts, int maxAttempts,
                  int timeoutSeconds, Instant nextRunAt, String workerId, Instant leaseExpiresAt, String idempotencyKey,
                  UUID scheduleId, String callbackUrl, String lastError, JsonNode result, Instant createdAt, Instant startedAt,
                  Instant finishedAt, Instant updatedAt) {}
