package dev.jobflow.job;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.jobflow.common.Page;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.stereotype.Repository;

/** All SQL for jobs. User-facing methods always take the owner id; there is no unscoped findById for user data. */
@Repository
public class JobRepo {
    private final JdbcTemplate j;
    private final ObjectMapper om;
    private final TransactionTemplate tt;

    public JobRepo(JdbcTemplate j, ObjectMapper om, PlatformTransactionManager tm) { this.j = j; this.om = om; this.tt = new TransactionTemplate(tm); }

    private JsonNode json(String s) {
        try { return s == null ? null : om.readTree(s); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static Instant ts(ResultSet rs, String c) throws SQLException {
        Timestamp t = rs.getTimestamp(c);
        return t == null ? null : t.toInstant();
    }

    final RowMapper<Job> M = (rs, i) -> new Job(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class), rs.getString("type"),
            json(rs.getString("payload")), rs.getString("status"), rs.getInt("priority"), rs.getInt("attempts"), rs.getInt("max_attempts"),
            rs.getInt("timeout_seconds"), ts(rs, "next_run_at"), rs.getString("worker_id"), ts(rs, "lease_expires_at"),
            rs.getString("idempotency_key"), rs.getObject("schedule_id", UUID.class), rs.getString("callback_url"),
            rs.getString("last_error"), json(rs.getString("result")), ts(rs, "created_at"), ts(rs, "started_at"),
            ts(rs, "finished_at"), ts(rs, "updated_at"));

    private static Timestamp t(Instant i) { return Timestamp.from(i); }

    // ---------- user-facing (owner scoped) ----------

    public void insert(NewJob n) {
        j.update("""
                insert into jobs(id, owner_id, type, payload, status, priority, max_attempts, timeout_seconds, next_run_at, idempotency_key, schedule_id, callback_url)
                values (?,?,?,?::jsonb,'QUEUED',?,?,?,?,?,?,?)""",
                n.id(), n.ownerId(), n.type(), n.payload().toString(), n.priority(), n.maxAttempts(), n.timeoutSeconds(),
                t(n.nextRunAt()), n.idempotencyKey(), n.scheduleId(), n.callbackUrl());
    }

    public Optional<Job> findByIdAndOwner(UUID id, UUID owner) {
        return j.query("select * from jobs where id = ? and owner_id = ?", M, id, owner).stream().findFirst();
    }

    public Optional<Job> findByIdem(UUID owner, String key) {
        return j.query("select * from jobs where owner_id = ? and idempotency_key = ?", M, owner, key).stream().findFirst();
    }

    public long count(UUID owner, String status) {
        return j.queryForObject("select count(*) from jobs where owner_id = ? and status = ?", Long.class, owner, status);
    }

    /** owner == null means "all owners" and is only used by admin code paths. */
    public Page<Job> list(UUID owner, String status, String type, String q, Instant from, Instant to, String sort, boolean asc, int page, int size) {
        StringBuilder w = new StringBuilder(" where 1=1");
        List<Object> a = new ArrayList<>();
        if (owner != null) { w.append(" and owner_id = ?"); a.add(owner); }
        if (status != null && !status.isBlank()) {
            if (status.equalsIgnoreCase("RETRYING")) w.append(" and status = 'QUEUED' and attempts > 0");
            else { w.append(" and status = ?"); a.add(status.toUpperCase()); }
        }
        if (type != null && !type.isBlank()) { w.append(" and type = ?"); a.add(type.toUpperCase()); }
        if (q != null && !q.isBlank()) {
            w.append(" and (id::text ilike ? or type ilike ? or last_error ilike ?)");
            String l = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            a.add(l); a.add(l); a.add(l);
        }
        if (from != null) { w.append(" and created_at >= ?"); a.add(t(from)); }
        if (to != null) { w.append(" and created_at <= ?"); a.add(t(to)); }
        String col = switch (sort == null ? "" : sort) {
            case "type" -> "type";
            case "status" -> "status";
            case "attempts" -> "attempts";
            case "finishedAt" -> "finished_at";
            default -> "created_at";
        };
        long total = j.queryForObject("select count(*) from jobs" + w, Long.class, a.toArray());
        List<Object> a2 = new ArrayList<>(a);
        a2.add(size);
        a2.add((long) page * size);
        List<Job> items = j.query("select * from jobs" + w + " order by " + col + (asc ? " asc" : " desc") + ", id limit ? offset ?", M, a2.toArray());
        return new Page<>(items, total, page, size);
    }

    public List<Execution> executions(UUID jobId, UUID owner) {
        return j.query("select * from job_executions where job_id = ? and owner_id = ? order by attempt, started_at",
                (rs, i) -> new Execution(rs.getObject("id", UUID.class), rs.getObject("job_id", UUID.class), rs.getInt("attempt"),
                        rs.getString("worker_id"), rs.getString("status"), rs.getString("error"), ts(rs, "started_at"), ts(rs, "finished_at")),
                jobId, owner);
    }

    public int cancel(UUID id, UUID owner) {
        return j.update("update jobs set status='CANCELLED', finished_at=now(), updated_at=now() where id=? and owner_id=? and status='QUEUED'", id, owner);
    }

    public int retryTerminal(UUID id, UUID owner) {
        return j.update("""
                update jobs set status='QUEUED', attempts=0, next_run_at=now(), finished_at=null, worker_id=null, lease_expires_at=null, updated_at=now()
                where id=? and owner_id=? and status in ('DEAD','CANCELLED')""", id, owner);
    }

    public int retryNow(UUID id, UUID owner) {
        return j.update("update jobs set next_run_at=now(), updated_at=now() where id=? and owner_id=? and status='QUEUED' and next_run_at > now()", id, owner);
    }

    public List<Job> requeueDead(UUID owner) {
        return j.query("""
                update jobs set status='QUEUED', attempts=0, next_run_at=now(), finished_at=null, worker_id=null, lease_expires_at=null, updated_at=now()
                where owner_id=? and status='DEAD' returning *""", M, owner);
    }

    public int deleteFinished(UUID id, UUID owner) {
        return j.update("delete from jobs where id=? and owner_id=? and status in ('SUCCEEDED','DEAD','CANCELLED')", id, owner);
    }

    public long countQueuedByPriority(UUID owner, int priority) {
        return j.queryForObject("select count(*) from jobs where owner_id = ? and priority = ? and status = 'QUEUED'", Long.class, owner, priority);
    }

    // ---------- system (worker side, no RLS) ----------

    public Optional<Job> findAny(UUID id) { return j.query("select * from jobs where id = ?", M, id).stream().findFirst(); }

    public Optional<Job> claim(UUID id, String worker, int leaseSec) {
        return tt.execute(status -> {
            List<UUID> owners = j.query("select owner_id from jobs where id = ?", (rs, i) -> rs.getObject(1, UUID.class), id);
            if (owners.isEmpty()) return Optional.empty();
            UUID ownerId = owners.get(0);
            j.queryForList("select pg_advisory_xact_lock(hashtext(?))::text", String.class, ownerId.toString());
            return j.query("""
                    update jobs set status='RUNNING', worker_id=?, attempts=attempts+1, started_at=now(),
                      lease_expires_at = now() + (? * interval '1 second'), updated_at=now()
                    where id=? and status='QUEUED'
                      and (select count(*) from jobs r where r.owner_id = jobs.owner_id and r.status='RUNNING')
                          < (select u.max_running from users u where u.id = jobs.owner_id)
                    returning *""", M, worker, leaseSec, id).stream().findFirst();
        });
    }

    public int heartbeat(UUID id, String worker, int attempt, int leaseSec) {
        return j.update("update jobs set lease_expires_at = now() + (? * interval '1 second') where id=? and worker_id=? and attempts=? and status='RUNNING'",
                leaseSec, id, worker, attempt);
    }

    public int succeed(UUID id, String worker, int attempt, String resultJson) {
        return j.update("""
                update jobs set status='SUCCEEDED', result=?::jsonb, last_error=null, finished_at=now(), lease_expires_at=null, updated_at=now()
                where id=? and worker_id=? and attempts=? and status='RUNNING'""", resultJson, id, worker, attempt);
    }

    public int retryLater(UUID id, String worker, int attempt, Instant next, String error) {
        return j.update("""
                update jobs set status='QUEUED', next_run_at=?, last_error=?, lease_expires_at=null, updated_at=now()
                where id=? and worker_id=? and attempts=? and status='RUNNING'""", t(next), error, id, worker, attempt);
    }

    public int dead(UUID id, String worker, int attempt, String error) {
        return j.update("""
                update jobs set status='DEAD', last_error=?, finished_at=now(), lease_expires_at=null, updated_at=now()
                where id=? and worker_id=? and attempts=? and status='RUNNING'""", error, id, worker, attempt);
    }

    public record Released(int priority, UUID ownerId) {}

    /** Graceful shutdown: hand an unfinished job back without counting the interrupted attempt. */
    public Optional<Released> release(UUID id, String worker) {
        return j.query("""
                update jobs set status='QUEUED', attempts=greatest(attempts-1,0), next_run_at=now(), worker_id=null, lease_expires_at=null, updated_at=now()
                where id=? and worker_id=? and status='RUNNING' returning priority, owner_id""",
                (rs, i) -> new Released(rs.getInt("priority"), rs.getObject("owner_id", UUID.class)), id, worker).stream().findFirst();
    }

    public void insertExecution(Job job, String worker, String status, String error, Instant started) {
        j.update("insert into job_executions(job_id, owner_id, attempt, worker_id, status, error, started_at, finished_at) values (?,?,?,?,?,?,?,now())",
                job.id(), job.ownerId(), job.attempts(), worker, status, error, t(started));
    }

    public List<Job> lockExpired(int limit) {
        return j.query("select * from jobs where status='RUNNING' and lease_expires_at < now() order by lease_expires_at limit ? for update skip locked", M, limit);
    }

    public int recoverExpired(UUID id, boolean dead) {
        return j.update(dead
                ? "update jobs set status='DEAD', last_error='Lease expired (worker lost)', finished_at=now(), lease_expires_at=null, updated_at=now() where id=? and status='RUNNING'"
                : "update jobs set status='QUEUED', next_run_at=now(), last_error='Lease expired (worker lost)', lease_expires_at=null, updated_at=now() where id=? and status='RUNNING'", id);
    }

    public List<Job> staleQueued(int limit) {
        return j.query("select * from jobs where status='QUEUED' and updated_at < now() - interval '60 seconds' order by updated_at limit ?", M, limit);
    }

    public int adminRequeue(UUID id) {
        return j.update("""
                update jobs set status='QUEUED', attempts=0, next_run_at=now(), finished_at=null, worker_id=null, lease_expires_at=null, updated_at=now()
                where id=? and status in ('DEAD','RUNNING','CANCELLED')""", id);
    }

    public int deleteOlderThan(int days) {
        return j.update("delete from jobs where finished_at < now() - (? * interval '1 day')", days);
    }
}
