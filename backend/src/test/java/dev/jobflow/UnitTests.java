package dev.jobflow;

import static org.junit.jupiter.api.Assertions.*;

import dev.jobflow.common.SsrfGuard;
import dev.jobflow.schedule.ScheduleService;
import dev.jobflow.worker.Backoff;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class UnitTests {
    @Test void backoffDoublesAndCaps() {
        assertEquals(5000, Backoff.delayMillis(1, 5, 900, 0.2, 0.5));
        assertEquals(40000, Backoff.delayMillis(4, 5, 900, 0.2, 0.5));
        assertEquals(900000, Backoff.delayMillis(12, 5, 900, 0.2, 0.5));
        assertEquals(4000, Backoff.delayMillis(1, 5, 900, 0.2, 0.0));
        assertEquals(6000, Backoff.delayMillis(1, 5, 900, 0.2, 1.0));
    }

    @Test void ssrfBlocksInternalTargets() {
        SsrfGuard g = new SsrfGuard(false);
        for (String u : new String[]{"http://127.0.0.1/", "http://localhost/", "http://10.1.2.3/", "http://172.16.0.1/",
                "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "ftp://example.com/"})
            assertThrows(IllegalArgumentException.class, () -> g.check(u), u);
        assertDoesNotThrow(() -> g.check("http://93.184.216.34/"));
    }

    @Test void cronNextFire() {
        Instant n = ScheduleService.next("0 0 * * * *", "UTC", Instant.parse("2026-01-01T10:30:00Z"));
        assertEquals(Instant.parse("2026-01-01T11:00:00Z"), n);
    }
}
