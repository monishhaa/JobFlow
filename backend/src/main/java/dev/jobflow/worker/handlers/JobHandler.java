package dev.jobflow.worker.handlers;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

/** One class per job type. Delivery is at-least-once, so execute() must be idempotent (use jobId as dedupe key). */
public interface JobHandler {
    String type();

    /** Throw IllegalArgumentException with a readable message for bad payloads. */
    default void validate(JsonNode payload) {}

    /** Return any JSON-serialisable result. Honour thread interrupts (timeout and lease loss interrupt the thread). */
    Object execute(JsonNode payload, UUID jobId) throws Exception;

    static JsonNode need(JsonNode p, String field) {
        JsonNode n = p.get(field);
        if (n == null || n.isNull()) throw new IllegalArgumentException("payload." + field + " is required");
        return n;
    }

    static double num(JsonNode p, String field, double def, double min, double max) {
        JsonNode n = p.get(field);
        if (n == null || n.isNull()) return def;
        if (!n.isNumber() || n.asDouble() < min || n.asDouble() > max) throw new IllegalArgumentException("payload." + field + " must be a number between " + min + " and " + max);
        return n.asDouble();
    }
}
