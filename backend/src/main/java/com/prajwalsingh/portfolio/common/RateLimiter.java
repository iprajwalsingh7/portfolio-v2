package com.prajwalsingh.portfolio.common;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * In-memory token bucket, keyed by whatever the caller passes (here: hashed IP).
 *
 * Why hand-rolled instead of Bucket4j: this needs ~40 lines and no dependency,
 * and a single-instance portfolio has no reason to coordinate limits across
 * nodes. If this ever runs more than one replica, the buckets need to move to
 * Redis — the interface below does not change, only Bucket's storage.
 *
 * Concurrency: buckets are created atomically via computeIfAbsent, and each
 * bucket serialises its own refill/consume under its own lock. Two requests from
 * different IPs never contend; two from the same IP contend for microseconds.
 */
@Component
public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * Consumes one token.
     *
     * @param key      must be namespaced per use case, e.g. "contact:" + hash.
     *                 Buckets are shared by key and a bucket adopts whatever
     *                 capacity its most recent caller passed, so two call sites
     *                 with different limits sharing one key silently give each
     *                 other the wrong budget.
     * @param capacity tokens available in a burst
     * @param refill   how long a fully drained bucket takes to refill
     * @return seconds until the next token, or 0 if the call is allowed
     */
    public long tryConsume(String key, int capacity, Duration refill) {
        long nanosPerToken = Math.max(1, refill.toNanos() / Math.max(1, capacity));
        Bucket bucket = buckets.computeIfAbsent(key, k -> new Bucket(capacity));
        return bucket.consume(capacity, nanosPerToken);
    }

    /** Consumes a token or throws. */
    public void require(String key, int capacity, Duration refill, String message) {
        long wait = tryConsume(key, capacity, refill);
        if (wait > 0) {
            throw new RateLimitedException(message, wait);
        }
    }

    /**
     * Drops buckets that have fully refilled — they are indistinguishable from a
     * fresh bucket, so keeping them only leaks memory.
     */
    @Scheduled(fixedDelay = 10, initialDelay = 10, timeUnit = java.util.concurrent.TimeUnit.MINUTES)
    void evictIdle() {
        int before = buckets.size();
        buckets.values().removeIf(Bucket::isFull);
        int removed = before - buckets.size();
        if (removed > 0) {
            log.debug("Evicted {} idle rate-limit buckets ({} remaining)", removed, buckets.size());
        }
    }

    private static final class Bucket {

        private double tokens;
        private long lastRefillNanos = System.nanoTime();
        private int capacity;

        Bucket(int capacity) {
            this.capacity = capacity;
            this.tokens = capacity;
        }

        synchronized long consume(int cap, long nanosPerToken) {
            this.capacity = cap;
            refill(cap, nanosPerToken);
            if (tokens >= 1.0) {
                tokens -= 1.0;
                return 0;
            }
            double missing = 1.0 - tokens;
            return Math.max(1, (long) Math.ceil(missing * nanosPerToken / 1_000_000_000d));
        }

        private void refill(int cap, long nanosPerToken) {
            long now = System.nanoTime();
            long elapsed = now - lastRefillNanos;
            if (elapsed <= 0) {
                return;
            }
            lastRefillNanos = now;
            tokens = Math.min(cap, tokens + (double) elapsed / nanosPerToken);
        }

        synchronized boolean isFull() {
            return tokens >= capacity;
        }
    }
}
