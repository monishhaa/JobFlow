package dev.jobflow.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String id = UUID.randomUUID().toString().substring(0, 8);
        MDC.put("traceId", id);
        res.setHeader("X-Trace-Id", id);
        try {
            if (req.getContentLengthLong() > 262_144) {
                res.setStatus(413);
                res.setContentType("application/json");
                res.getWriter().write("{\"code\":\"PAYLOAD_TOO_LARGE\",\"message\":\"Request body too large\"}");
                return;
            }
            chain.doFilter(req, res);
        } finally { MDC.clear(); }
    }
}
