package com.prajwalsingh.portfolio.metrics;

import java.time.LocalDate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Nightly prune of the dedupe ledger.
 *
 * An application job rather than pg_cron, so it works unchanged on managed
 * Postgres (where extensions are often unavailable) and on H2 in dev.
 *
 * Two days are kept rather than one to cover an edge case: the counter uses
 * LocalDate.now() in the JVM's zone, so around midnight — or after a timezone
 * change — yesterday's rows can still be the ones being matched against.
 */
@Component
public class RetentionJob {

    private static final Logger log = LoggerFactory.getLogger(RetentionJob.class);
    private static final int KEEP_DAYS = 2;

    private final VisitorSeenRepository seen;

    public RetentionJob(VisitorSeenRepository seen) {
        this.seen = seen;
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void prune() {
        int removed = seen.deleteOlderThan(LocalDate.now().minusDays(KEEP_DAYS));
        if (removed > 0) {
            log.info("Pruned {} visitor_seen rows older than {} days", removed, KEEP_DAYS);
        }
    }
}
