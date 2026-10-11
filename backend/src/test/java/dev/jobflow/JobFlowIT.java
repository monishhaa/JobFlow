package dev.jobflow;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class JobFlowIT extends AbstractIT {
    static final String OK = "{\"type\":\"DEMO_FLAKY\",\"payload\":{\"durationSec\":0,\"failRate\":0}}";

    @Test void succeeds() throws Exception {
        String t = newUser(), id = submitId(t, OK);
        await().atMost(Duration.ofSeconds(20)).until(() -> job(t, id).get("status").asText().equals("SUCCEEDED"));
    }

    @Test void failingJobRetriesThenDies() throws Exception {
        String t = newUser();
        String id = submitId(t, "{\"type\":\"DEMO_FLAKY\",\"payload\":{\"durationSec\":0,\"failRate\":1},\"maxAttempts\":2}");
        await().atMost(Duration.ofSeconds(30)).until(() -> job(t, id).get("status").asText().equals("DEAD"));
        JsonNode j = job(t, id);
        assertThat(j.get("attempts").asInt()).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from job_executions where job_id = ?::uuid", Integer.class, id)).isEqualTo(2);
    }

    @Test void idempotencyKey() throws Exception {
        String t = newUser();
        String first = submit(t, OK, "k1").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String second = submit(t, OK, "k1").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(om.readTree(second).get("id")).isEqualTo(om.readTree(first).get("id"));
        submit(t, "{\"type\":\"DEMO_FLAKY\",\"payload\":{\"durationSec\":0,\"failRate\":0.5}}", "k1").andExpect(status().isUnprocessableEntity());
    }

    @Test void validationRejectsBadInput() throws Exception {
        String t = newUser();
        submit(t, "{\"type\":\"NOPE\"}", null).andExpect(status().isBadRequest());
        submit(t, "{\"type\":\"HTTP_CALL\",\"payload\":{\"url\":\"ftp://x\"}}", null).andExpect(status().isBadRequest());
    }

    @Test void everyJobRunsExactlyOnce() throws Exception {
        String t = newUser();
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 200; i++) ids.add(submitId(t, OK));
        await().atMost(Duration.ofSeconds(90)).until(() ->
                jdbc.queryForObject("select count(*) from jobs where id = any(?::uuid[]) and status = 'SUCCEEDED'", Integer.class,
                        (Object) "{" + String.join(",", ids) + "}") == 200);
        assertThat(jdbc.queryForObject("select count(*) from job_executions where job_id = any(?::uuid[])", Integer.class,
                (Object) "{" + String.join(",", ids) + "}")).isEqualTo(200);
    }
}
