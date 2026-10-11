package dev.jobflow.common;

import java.util.Optional;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Only one copy of a background loop runs at a time, using a PostgreSQL transaction-level advisory lock. */
@Component
public class LeaderLock {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tt;

    public LeaderLock(JdbcTemplate jdbc, PlatformTransactionManager tm) { this.jdbc = jdbc; this.tt = new TransactionTemplate(tm); }

    public <T> Optional<T> runIfLeader(String name, Supplier<T> work) {
        return Optional.ofNullable(tt.execute(st -> {
            Boolean got = jdbc.queryForObject("select pg_try_advisory_xact_lock(hashtext(?))", Boolean.class, name);
            return Boolean.TRUE.equals(got) ? work.get() : null;
        }));
    }
}
