package dev.jobflow;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;

class IsolationIT extends AbstractIT {
    @Test void userBCannotTouchUserAJobs() throws Exception {
        String a = newUser(), b = newUser();
        String id = submitId(a, "{\"type\":\"DEMO_FLAKY\",\"payload\":{\"durationSec\":0,\"failRate\":0},\"runAt\":\"2099-01-01T00:00:00Z\"}");
        String h = "Authorization";
        mvc.perform(get("/api/jobs/" + id).header(h, "Bearer " + b)).andExpect(status().isNotFound());
        mvc.perform(get("/api/jobs/" + id + "/executions").header(h, "Bearer " + b)).andExpect(status().isNotFound());
        mvc.perform(get("/api/jobs").header(h, "Bearer " + b)).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(post("/api/jobs/" + id + "/cancel").header(h, "Bearer " + b)).andExpect(status().isNotFound());
        mvc.perform(post("/api/jobs/" + id + "/retry").header(h, "Bearer " + b)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/jobs/" + id).header(h, "Bearer " + b)).andExpect(status().isNotFound());
        mvc.perform(get("/api/jobs/" + id).header(h, "Bearer " + a)).andExpect(status().isOk());
        mvc.perform(get("/api/admin/users").header(h, "Bearer " + b)).andExpect(status().isForbidden());
        mvc.perform(get("/api/jobs")).andExpect(status().isUnauthorized());
    }
}
