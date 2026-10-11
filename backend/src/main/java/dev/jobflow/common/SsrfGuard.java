package dev.jobflow.common;

import java.net.InetAddress;
import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Blocks HTTP_CALL / webhook targets that point at internal networks or the cloud metadata address. */
@Component
public class SsrfGuard {
    private final boolean allowPrivate;

    public SsrfGuard(@Value("${app.ssrf.allow-private:false}") boolean allowPrivate) { this.allowPrivate = allowPrivate; }

    /** Syntactic check only (cheap, used at submit time). */
    public URI parse(String url) {
        try {
            URI u = URI.create(url);
            String s = u.getScheme();
            if (s == null || !(s.equalsIgnoreCase("http") || s.equalsIgnoreCase("https"))) throw new IllegalArgumentException("Only http and https URLs are allowed");
            if (u.getHost() == null) throw new IllegalArgumentException("URL has no host");
            return u;
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(e.getMessage() == null ? "Invalid URL" : e.getMessage());
        }
    }

    /** Full check: resolves the host and rejects non-public addresses. Call again after every redirect. */
    public URI check(String url) {
        URI u = parse(url);
        if (allowPrivate) return u;
        try {
            for (InetAddress a : InetAddress.getAllByName(u.getHost())) {
                byte[] b = a.getAddress();
                boolean uniqueLocal = b.length == 16 && (b[0] & 0xFE) == 0xFC;
                boolean cgnat = b.length == 4 && (b[0] & 0xFF) == 100 && (b[1] & 0xC0) == 64;
                if (a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress() || a.isAnyLocalAddress() || a.isMulticastAddress() || uniqueLocal || cgnat)
                    throw new IllegalArgumentException("Target address is not allowed");
            }
        } catch (java.net.UnknownHostException e) {
            throw new IllegalArgumentException("Cannot resolve host");
        }
        return u;
    }
}
