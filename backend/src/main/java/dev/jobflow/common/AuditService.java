package dev.jobflow.common;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Service
public class AuditService {
    private final JdbcTemplate jdbc;

    public AuditService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public static String clientIp() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes a) {
            HttpServletRequest r = a.getRequest();
            return r.getRemoteAddr(); // behind a proxy set FORWARD_HEADERS=native so the container resolves it from trusted proxies only
        }
        return null;
    }

    public void log(UUID actor, String action, String targetType, Object targetId) {
        jdbc.update("insert into audit_log(actor_id, action, target_type, target_id, ip) values (?,?,?,?,?)",
                actor, action, targetType, targetId == null ? null : targetId.toString(), clientIp());
    }
}
