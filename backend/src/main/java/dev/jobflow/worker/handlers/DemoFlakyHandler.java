package dev.jobflow.worker.handlers;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Component;

@Component
public class DemoFlakyHandler implements JobHandler {
    public String type() { return "DEMO_FLAKY"; }

    public void validate(JsonNode p) {
        JobHandler.num(p, "durationSec", 1, 0, 300);
        JobHandler.num(p, "failRate", 0.3, 0, 1);
    }

    public Object execute(JsonNode p, UUID jobId) throws Exception {
        double dur = JobHandler.num(p, "durationSec", 1, 0, 300);
        double fail = JobHandler.num(p, "failRate", 0.3, 0, 1);
        Thread.sleep((long) (dur * 1000));
        if (ThreadLocalRandom.current().nextDouble() < fail) throw new IllegalStateException("Simulated failure");
        return Map.of("slept", dur);
    }
}
