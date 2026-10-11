package dev.jobflow.job;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;

public record SubmitRequest(@NotBlank String type, JsonNode payload, String priority, Instant runAt,
                            Integer maxAttempts, Integer timeoutSeconds, String callbackUrl) {}
