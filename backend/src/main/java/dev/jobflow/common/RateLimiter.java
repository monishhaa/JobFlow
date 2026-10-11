package dev.jobflow.common;

import java.time.Duration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/** Fixed-window counter in Redis. Keys are namespaced by the caller, e.g. rl:{userId}:submit. */
@Component
public class RateLimiter {
    private final StringRedisTemplate redis;

    public RateLimiter(StringRedisTemplate redis) { this.redis = redis; }

    public void hit(String key, int limit, int windowSeconds) {
        Long n = redis.opsForValue().increment(key);
        if (n != null && n == 1) redis.expire(key, Duration.ofSeconds(windowSeconds));
        if (n != null && n > limit) {
            Long ttl = redis.getExpire(key);
            throw new ApiException(429, "RATE_LIMITED", "Too many requests", ttl == null || ttl < 1 ? windowSeconds : ttl.intValue());
        }
    }

    public long current(String key) {
        String v = redis.opsForValue().get(key);
        return v == null ? 0 : Long.parseLong(v);
    }
}
