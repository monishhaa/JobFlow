package dev.jobflow.stats;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Routes events:{userId} messages to that user's SSE connections only. */
@Component
@Profile("!worker")
public class EventHub implements MessageListener {
    private static final Logger log = LoggerFactory.getLogger(EventHub.class);
    private final Map<UUID, List<SseEmitter>> emitters = new ConcurrentHashMap<>();
    private final RedisMessageListenerContainer container;

    public EventHub(RedisMessageListenerContainer container) { this.container = container; }

    @PostConstruct
    void subscribe() { container.addMessageListener(this, new PatternTopic("events:*")); }

    public SseEmitter register(UUID userId) {
        SseEmitter em = new SseEmitter(30 * 60_000L);
        emitters.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(em);
        Runnable remove = () -> emitters.computeIfPresent(userId, (k, l) -> { l.remove(em); return l.isEmpty() ? null : l; });
        em.onCompletion(remove); em.onTimeout(remove); em.onError(e -> remove.run());
        try { em.send(SseEmitter.event().name("ready").data("ok")); } catch (IOException e) { remove.run(); }
        return em;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String channel = new String(message.getChannel());
            UUID uid = UUID.fromString(channel.substring("events:".length()));
            List<SseEmitter> l = emitters.get(uid);
            if (l == null) return;
            String data = new String(message.getBody());
            for (SseEmitter em : l) {
                try { em.send(SseEmitter.event().name("job").data(data)); } catch (Exception e) { l.remove(em); }
            }
        } catch (Exception e) {
            log.debug("bad event message: {}", e.getMessage());
        }
    }

    @Scheduled(fixedDelay = 20000)
    void keepAlive() {
        emitters.values().forEach(l -> l.forEach(em -> { try { em.send(SseEmitter.event().comment("ping")); } catch (Exception e) { l.remove(em); } }));
    }
}
