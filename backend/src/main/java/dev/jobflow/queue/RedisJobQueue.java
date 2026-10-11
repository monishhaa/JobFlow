package dev.jobflow.queue;

import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

/** Redis holds job ids per owner and priority ring. PostgreSQL stays the source of truth. */
@Component
public class RedisJobQueue {
    private static final Logger log = LoggerFactory.getLogger(RedisJobQueue.class);
    public static final String[] NAMES = {"high", "normal", "low"};

    private final StringRedisTemplate redis;
    private final DefaultRedisScript<String> claimScript = new DefaultRedisScript<>();
    private final DefaultRedisScript<Long> enqueueScript = new DefaultRedisScript<>();

    public RedisJobQueue(StringRedisTemplate redis) {
        this.redis = redis;
        claimScript.setLocation(new ClassPathResource("lua/claim.lua"));
        claimScript.setResultType(String.class);

        enqueueScript.setLocation(new ClassPathResource("lua/enqueue.lua"));
        enqueueScript.setResultType(Long.class);
    }

    public String claim(long nowMs) {
        return redis.execute(claimScript, Collections.emptyList(), String.valueOf(nowMs));
    }

    /** Never throws: if Redis is down the reconciler re-adds the id later. */
    public void enqueue(UUID id, UUID ownerId, int priority, long scoreMs) {
        try {
            List<String> keys = List.of("qo:" + priority + ":" + ownerId, "rr:" + priority, "rrset:" + priority);
            redis.execute(enqueueScript, keys, id.toString(), String.valueOf(scoreMs), ownerId.toString(), "set");
        } catch (Exception e) {
            log.warn("Redis enqueue failed for job {}, reconciler will repair: {}", id, e.getMessage());
        }
    }

    public boolean addIfAbsent(UUID id, UUID ownerId, int priority, long scoreMs) {
        try {
            List<String> keys = List.of("qo:" + priority + ":" + ownerId, "rr:" + priority, "rrset:" + priority);
            Long res = redis.execute(enqueueScript, keys, id.toString(), String.valueOf(scoreMs), ownerId.toString(), "nx");
            return res != null && res == 1L;
        } catch (Exception e) {
            log.warn("Redis addIfAbsent failed for job {}: {}", id, e.getMessage());
            return false;
        }
    }

    public void remove(UUID id, UUID ownerId, int priority) {
        try {
            redis.opsForZSet().remove("qo:" + priority + ":" + ownerId, id.toString());
        } catch (Exception e) {
            log.warn("Redis remove failed: {}", e.getMessage());
        }
    }

    public long depth(int priority) {
        try {
            List<String> owners = redis.opsForList().range("rr:" + priority, 0, -1);
            if (owners == null || owners.isEmpty()) return 0;
            long total = 0;
            for (String owner : owners) {
                Long c = redis.opsForZSet().zCard("qo:" + priority + ":" + owner);
                if (c != null) total += c;
            }
            return total;
        } catch (Exception e) {
            log.warn("Redis depth calculation failed: {}", e.getMessage());
            return 0;
        }
    }
}
