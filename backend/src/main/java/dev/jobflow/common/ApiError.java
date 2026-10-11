package dev.jobflow.common;

public record ApiError(String code, String message, Object details, String traceId) {}
