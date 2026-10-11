package dev.jobflow.worker.handlers;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.zip.CRC32;
import org.springframework.stereotype.Component;

@Component
public class GenerateReportHandler implements JobHandler {
    public String type() { return "GENERATE_REPORT"; }

    public void validate(JsonNode p) {
        JobHandler.num(p, "rows", 1000, 1, 1_000_000);
        JobHandler.num(p, "durationSec", 1, 0, 300);
        if (p.hasNonNull("format") && !"csv".equalsIgnoreCase(p.get("format").asText())) throw new IllegalArgumentException("payload.format must be csv");
    }

    public Object execute(JsonNode p, UUID jobId) throws Exception {
        int rows = (int) JobHandler.num(p, "rows", 1000, 1, 1_000_000);
        double dur = JobHandler.num(p, "durationSec", 1, 0, 300);
        Thread.sleep((long) (dur * 1000));
        CRC32 crc = new CRC32();
        long bytes = 0;
        for (int i = 1; i <= rows; i++) {
            if ((i & 1023) == 0 && Thread.currentThread().isInterrupted()) throw new InterruptedException("cancelled");
            byte[] line = (i + ",row-" + i + "," + (i * 31L % 997) + "\n").getBytes(StandardCharsets.UTF_8);
            crc.update(line);
            bytes += line.length;
        }
        return Map.of("rows", rows, "format", "csv", "bytes", bytes, "crc32", Long.toHexString(crc.getValue()));
    }
}
