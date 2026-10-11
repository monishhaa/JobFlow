package dev.jobflow.worker.handlers;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Simulated email. Idempotent: the send record is keyed by job id, a second run skips the send. */
@Component
public class SendEmailHandler implements JobHandler {
    private static final Logger log = LoggerFactory.getLogger(SendEmailHandler.class);
    private final JdbcTemplate j;

    public SendEmailHandler(JdbcTemplate j) { this.j = j; }

    public String type() { return "SEND_EMAIL"; }

    public void validate(JsonNode p) {
        String to = JobHandler.need(p, "to").asText();
        if (!to.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$") || to.length() > 255) throw new IllegalArgumentException("payload.to must be an email address");
        if (JobHandler.need(p, "subject").asText().length() > 255) throw new IllegalArgumentException("payload.subject too long");
        JobHandler.need(p, "body");
    }

    public Object execute(JsonNode p, UUID jobId) {
        int n = j.update("insert into email_outbox(job_id, recipient, subject) values (?,?,?) on conflict (job_id) do nothing",
                jobId, p.get("to").asText(), p.get("subject").asText());
        if (n == 0) return Map.of("sent", false, "reason", "already sent by an earlier attempt");
        log.info("Simulated email sent for job {}", jobId); // never log recipient/body
        return Map.of("sent", true);
    }
}
