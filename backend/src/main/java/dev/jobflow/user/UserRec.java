package dev.jobflow.user;

import java.time.Instant;
import java.util.UUID;

public record UserRec(UUID id, String email, String passwordHash, String role, String status,
                      int maxRunning, int maxQueued, int rateLimitPerMin, String webhookSecret, Instant createdAt) {}
