package dev.jobflow.user;

import dev.jobflow.auth.AuthUser;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepo {
    private final JdbcTemplate j;

    public UserRepo(JdbcTemplate j) { this.j = j; }

    static final RowMapper<UserRec> M = (rs, i) -> new UserRec(rs.getObject("id", UUID.class), rs.getString("email"),
            rs.getString("password_hash"), rs.getString("role"), rs.getString("status"), rs.getInt("max_running"),
            rs.getInt("max_queued"), rs.getInt("rate_limit_per_min"), rs.getString("webhook_secret"),
            rs.getTimestamp("created_at").toInstant());

    public Optional<UserRec> byEmail(String email) {
        return j.query("select * from users where email = ?", M, email.toLowerCase()).stream().findFirst();
    }

    public Optional<UserRec> byId(UUID id) { return j.query("select * from users where id = ?", M, id).stream().findFirst(); }

    public Optional<AuthUser> activeAuth(UUID id) {
        return j.query("select id, email, role from users where id = ? and status = 'ACTIVE'",
                (rs, i) -> new AuthUser(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("role")), id).stream().findFirst();
    }

    public UUID create(String email, String hash, String role, String webhookSecret) {
        UUID id = UUID.randomUUID();
        j.update("insert into users(id, email, password_hash, role, webhook_secret) values (?,?,?,?,?)",
                id, email.toLowerCase(), hash, role, webhookSecret);
        return id;
    }

    public List<UserRec> page(int limit, int offset) {
        return j.query("select * from users order by created_at limit ? offset ?", M, limit, offset);
    }

    public long count() { return j.queryForObject("select count(*) from users", Long.class); }

    public void setPassword(UUID id, String hash) { j.update("update users set password_hash = ? where id = ?", hash, id); }

    public void setWebhookSecret(UUID id, String s) { j.update("update users set webhook_secret = ? where id = ?", s, id); }

    public int updateAdmin(UUID id, String status, Integer maxRunning, Integer maxQueued, Integer rate) {
        return j.update("""
                update users set status = coalesce(?, status), max_running = coalesce(?, max_running),
                max_queued = coalesce(?, max_queued), rate_limit_per_min = coalesce(?, rate_limit_per_min) where id = ?""",
                status, maxRunning, maxQueued, rate, id);
    }
}
