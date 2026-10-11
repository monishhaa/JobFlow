package dev.jobflow.job;

import java.time.Instant;
import java.util.UUID;

public record Execution(UUID id, UUID jobId, int attempt, String workerId, String status, String error, Instant startedAt, Instant finishedAt) {}
