package dev.jobflow.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.jobflow.auth.AuthUser;
import dev.jobflow.common.ApiException;
import dev.jobflow.common.Tx;
import dev.jobflow.job.JobService;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;

@Service
public class ScheduleService {
    private final Tx tx;
    private final JdbcTemplate j;
    private final JobService jobs;
    private final ObjectMapper om;
    private final dev.jobflow.common.PayloadCrypto crypto;

    public ScheduleService(Tx tx, JdbcTemplate j, JobService jobs, ObjectMapper om, dev.jobflow.common.PayloadCrypto crypto) {
        this.tx = tx; this.j = j; this.jobs = jobs; this.om = om; this.crypto = crypto;
    }

    private Map<String, Object> maskMap(Map<String, Object> map) {
        if (map == null) return null;
        Map<String, Object> out = new java.util.LinkedHashMap<>(map);
        String jobType = (String) map.get("jobType");
        String pStr = (String) map.get("payload");
        if (pStr != null) {
            try {
                JsonNode node = om.readTree(pStr);
                out.put("payload", crypto.mask(jobType, node).toString());
            } catch (Exception ignored) {}
        }
        return out;
    }

    /** Spring cron format: 6 fields (second minute hour day month weekday), e.g. "0 0 9 * * MON-FRI". */
    public static Instant next(String cron, String tz, Instant after) {
        ZonedDateTime n = CronExpression.parse(cron).next(after.atZone(ZoneId.of(tz)));
        return n == null ? null : n.toInstant();
    }

    private static void checkInterval(String cron, String tz) {
        Instant a = next(cron, tz, Instant.now());
        Instant b = a == null ? null : next(cron, tz, a);
        if (a != null && b != null && Duration.between(a, b).getSeconds() < 60) throw ApiException.bad("Schedules may fire at most once per minute");
    }

    public List<Instant> preview(String cron, String tz, int count) {
        try {
            List<Instant> out = new ArrayList<>();
            Instant t = Instant.now();
            for (int i = 0; i < count; i++) { t = next(cron, tz, t); if (t == null) break; out.add(t); }
            return out;
        } catch (Exception e) { throw ApiException.bad("Invalid cron expression or timezone"); }
    }

    public Map<String, Object> create(AuthUser u, String name, String cron, String tz, String type, JsonNode payload, boolean enabled) {
        String zone = tz == null || tz.isBlank() ? "UTC" : tz;
        Instant first;
        try { first = next(cron, zone, Instant.now()); } catch (Exception e) { throw ApiException.bad("Invalid cron expression or timezone"); }
        if (first == null) throw ApiException.bad("Cron expression never fires");
        checkInterval(cron, zone);
        JsonNode p = jobs.validatePayload(type, payload);
        JsonNode stored = crypto.protect(type, p);
        UUID id = UUID.randomUUID();
        return tx.asUser(u, () -> {
            if (j.queryForObject("select count(*) from schedules where owner_id = ?", Long.class, u.id()) >= 50) throw ApiException.bad("Schedule limit (50) reached");
            j.update("insert into schedules(id, owner_id, name, cron_expr, timezone, job_type, payload, enabled, next_fire_at) values (?,?,?,?,?,?,?::jsonb,?,?)",
                    id, u.id(), name, cron, zone, type.toUpperCase(), stored.toString(), enabled, Timestamp.from(first));
            return get(u, id);
        });
    }

    public List<Map<String, Object>> list(AuthUser u) {
        return tx.asUser(u, () -> j.queryForList(base() + " where owner_id = ? order by created_at desc", u.id()).stream().map(this::maskMap).toList());
    }

    public Map<String, Object> get(AuthUser u, UUID id) {
        return tx.asUser(u, () -> j.queryForList(base() + " where id = ? and owner_id = ?", id, u.id()).stream().findFirst()
                .map(this::maskMap)
                .orElseThrow(() -> ApiException.notFound("Schedule")));
    }

    public Map<String, Object> patch(AuthUser u, UUID id, String name, String cron, String tz, Boolean enabled, JsonNode payload) {
        return tx.asUser(u, () -> {
            Map<String, Object> cur = get(u, id);
            String c = cron != null ? cron : (String) cur.get("cronExpr");
            String z = tz != null ? tz : (String) cur.get("timezone");
            boolean en = enabled != null ? enabled : (Boolean) cur.get("enabled");
            Instant nf;
            try { nf = en ? next(c, z, Instant.now()) : null; } catch (Exception e) { throw ApiException.bad("Invalid cron expression or timezone"); }
            if (en) checkInterval(c, z);
            String jt = (String) cur.get("jobType");
            JsonNode p = payload != null ? crypto.protect(jt, jobs.validatePayload(jt, payload)) : null;
            j.update("""
                    update schedules set name = coalesce(?, name), cron_expr = ?, timezone = ?, enabled = ?, next_fire_at = ?,
                    payload = coalesce(?::jsonb, payload) where id = ? and owner_id = ?""",
                    name, c, z, en, nf == null ? null : Timestamp.from(nf), p == null ? null : p.toString(), id, u.id());
            return get(u, id);
        });
    }

    public void delete(AuthUser u, UUID id) {
        tx.asUser(u, () -> {
            if (j.update("delete from schedules where id = ? and owner_id = ?", id, u.id()) == 0) throw ApiException.notFound("Schedule");
            return null;
        });
    }

    private static String base() {
        return "select id, name, cron_expr as \"cronExpr\", timezone, job_type as \"jobType\", payload::text as payload, enabled, " +
                "next_fire_at as \"nextFireAt\", last_fire_at as \"lastFireAt\", created_at as \"createdAt\" from schedules";
    }
}
