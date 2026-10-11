package dev.jobflow;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
abstract class AbstractIT {
    static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16");
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7").withExposedPorts(6379);
    static { PG.start(); REDIS.start(); }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
        r.add("spring.flyway.user", PG::getUsername);
        r.add("spring.flyway.password", PG::getPassword);
        r.add("spring.data.redis.url", () -> "redis://" + REDIS.getHost() + ":" + REDIS.getMappedPort(6379));
        r.add("app.jwt.secret", () -> "test-secret-test-secret-test-secret-1234");
        r.add("app.retry.base-seconds", () -> "1");
        r.add("app.cookie-secure", () -> "false");
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired JdbcTemplate jdbc;

    String newUser() throws Exception {
        String email = "u" + UUID.randomUUID() + "@test.io", body = "{\"email\":\"" + email + "\",\"password\":\"Passw0rd!x\"}";
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
        String res = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        jdbc.update("update users set rate_limit_per_min = 100000, max_queued = 100000, max_running = 8 where email = ?", email);
        return om.readTree(res).get("accessToken").asText();
    }

    ResultActions submit(String token, String json, String idemKey) throws Exception {
        var rb = post("/api/jobs").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(json);
        if (idemKey != null) rb.header("Idempotency-Key", idemKey);
        return mvc.perform(rb);
    }

    String submitId(String token, String json) throws Exception {
        return om.readTree(submit(token, json, null).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    JsonNode job(String token, String id) throws Exception {
        return om.readTree(mvc.perform(get("/api/jobs/" + id).header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }
}
