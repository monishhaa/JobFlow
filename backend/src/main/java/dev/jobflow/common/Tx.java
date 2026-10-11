package dev.jobflow.common;

import dev.jobflow.auth.AuthUser;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Runs code in a transaction with app.user_id set, so PostgreSQL row level security applies to the API role. */
@Component
public class Tx {
    private final TransactionTemplate tt;
    private final JdbcTemplate jdbc;

    public Tx(PlatformTransactionManager tm, JdbcTemplate jdbc) { this.tt = new TransactionTemplate(tm); this.jdbc = jdbc; }

    public <T> T asUser(AuthUser u, Supplier<T> body) {
        return tt.execute(st -> {
            jdbc.queryForObject("select set_config('app.user_id', ?, true) || set_config('app.is_admin', ?, true)", String.class,
                    u.id().toString(), String.valueOf(u.admin()));
            return body.get();
        });
    }

    public <T> T run(Supplier<T> body) { return tt.execute(st -> body.get()); }
}
