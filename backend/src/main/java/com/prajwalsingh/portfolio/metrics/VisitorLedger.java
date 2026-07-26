package com.prajwalsingh.portfolio.metrics;

import java.time.LocalDate;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Owns the "have I seen this visitor today" write path.
 *
 * A separate bean on purpose. Spring's @Transactional is applied by a proxy, so a
 * method called from *inside* the same object never passes through that proxy and
 * silently runs with no transaction at all. Holding this as an injected dependency
 * means the annotation actually takes effect.
 *
 * Every write here is an idempotent upsert whose affected-row count carries the
 * answer, so there is no read-then-write to race on and no expected exception to
 * catch — an earlier version relied on catching a constraint violation, which both
 * failed to fire (save() merges assigned-id entities) and would have poisoned the
 * transaction if it had.
 */
@Component
public class VisitorLedger {

    private final ViewRepository views;
    private final VisitorSeenRepository seen;

    public VisitorLedger(ViewRepository views, VisitorSeenRepository seen) {
        this.views = views;
        this.seen = seen;
    }

    /**
     * @return true when this is the visitor's first view today
     */
    @Transactional
    public boolean recordFirstVisitToday(String ipHash) {
        LocalDate today = LocalDate.now();

        // The database decides. 0 rows means this visitor already claimed today.
        if (seen.claimDay(ipHash, today) == 0) {
            return false;
        }

        // increment() reports 0 when today's row does not exist yet. createDay()
        // then reports 0 if a concurrent request created it first, in which case
        // the increment still needs applying.
        if (views.increment(today) == 0 && views.createDay(today) == 0) {
            views.increment(today);
        }
        return true;
    }
}
