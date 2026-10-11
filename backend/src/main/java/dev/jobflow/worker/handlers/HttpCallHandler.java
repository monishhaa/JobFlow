package dev.jobflow.worker.handlers;

import com.fasterxml.jackson.databind.JsonNode;
import dev.jobflow.common.SsrfGuard;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class HttpCallHandler implements JobHandler {
    private static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD");
    private static final int MAX_BODY = 65536;
    private final SsrfGuard ssrf;
    private final dev.jobflow.common.PayloadCrypto crypto;
    private final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(Duration.ofSeconds(10)).build();

    public HttpCallHandler(SsrfGuard ssrf, dev.jobflow.common.PayloadCrypto crypto) { this.ssrf = ssrf; this.crypto = crypto; }

    public String type() { return "HTTP_CALL"; }

    public void validate(JsonNode p) {
        ssrf.parse(JobHandler.need(p, "url").asText());
        String m = p.path("method").asText("GET").toUpperCase();
        if (!METHODS.contains(m)) throw new IllegalArgumentException("payload.method not supported");
    }

    public Object execute(JsonNode p, UUID jobId) throws Exception {
        String method = p.path("method").asText("GET").toUpperCase();
        URI uri = ssrf.check(p.get("url").asText());
        String body = p.hasNonNull("body") ? (p.get("body").isTextual() ? p.get("body").asText() : p.get("body").toString()) : null;
        if (body != null && crypto.isEncrypted(body)) {
            body = crypto.decrypt(body);
        }
        for (int hop = 0; hop <= 3; hop++) {
            HttpRequest.Builder rb = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
                    .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
            JsonNode hs = p.get("headers");
            if (hs != null && hs.isObject()) hs.fields().forEachRemaining(e -> {
                String k = e.getKey().toLowerCase();
                if (!k.equals("host") && !k.equals("content-length") && !k.equals("connection")) {
                    String val = e.getValue().asText();
                    if (crypto.isEncrypted(val)) val = crypto.decrypt(val);
                    rb.header(e.getKey(), val);
                }
            });
            HttpResponse<InputStream> res = client.send(rb.build(), HttpResponse.BodyHandlers.ofInputStream());
            long bytes;
            try (InputStream in = res.body()) { bytes = in.readNBytes(MAX_BODY).length; }
            int sc = res.statusCode();
            if (sc >= 300 && sc < 400 && res.headers().firstValue("location").isPresent()) {
                uri = ssrf.check(uri.resolve(res.headers().firstValue("location").get()).toString()); // re-check every redirect
                continue;
            }
            int expect = p.path("expectStatus").asInt(0);
            if (expect > 0 ? sc != expect : (sc < 200 || sc >= 300)) throw new IllegalStateException("HTTP " + sc + " from target");
            return Map.of("status", sc, "bytesRead", bytes);
        }
        throw new IllegalStateException("Too many redirects");
    }
}
