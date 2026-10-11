package dev.jobflow.worker;

public final class Backoff {
    private Backoff() {}

    /** min(base * 2^(attempt-1), max) * (1 - jitter .. 1 + jitter). rnd01 is a uniform random number in [0,1). */
    public static long delayMillis(int attempt, int baseSec, int maxSec, double jitter, double rnd01) {
        double d = Math.min(baseSec * Math.pow(2, Math.max(0, attempt - 1)), maxSec);
        return (long) (d * (1 - jitter + 2 * jitter * rnd01) * 1000);
    }
}
