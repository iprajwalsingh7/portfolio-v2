package com.prajwalsingh.portfolio.metrics;

import java.time.Duration;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.prajwalsingh.portfolio.common.ClientIdentity;
import com.prajwalsingh.portfolio.common.RateLimiter;

/**
 * GET  /api/metrics/views — read the total
 * POST /api/metrics/views — register this visitor, then read the total
 *
 * The POST is rate limited generously: the service already deduplicates per day,
 * so the limit is only there to stop someone hammering the endpoint.
 */
@RestController
@RequestMapping("/api/metrics/views")
public class ViewCounterController {

    private static final int BURST = 30;
    private static final Duration WINDOW = Duration.ofMinutes(5);

    private final ViewCounterService counter;
    private final ClientIdentity identity;
    private final RateLimiter limiter;

    public ViewCounterController(ViewCounterService counter,
                                 ClientIdentity identity,
                                 RateLimiter limiter) {
        this.counter = counter;
        this.identity = identity;
        this.limiter = limiter;
    }

    public record ViewCount(long total) {}

    @GetMapping
    public ResponseEntity<ViewCount> read() {
        return ResponseEntity.ok()
                // Short cache: the number is decorative, staleness is fine, and
                // this keeps a crawler from generating traffic.
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(new ViewCount(counter.total()));
    }

    @PostMapping
    public ResponseEntity<ViewCount> register(HttpServletRequest request) {
        String who = identity.hash(request);
        limiter.require("views:" + who, BURST, WINDOW, "Slow down a little.");
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new ViewCount(counter.registerView(who)));
    }
}
