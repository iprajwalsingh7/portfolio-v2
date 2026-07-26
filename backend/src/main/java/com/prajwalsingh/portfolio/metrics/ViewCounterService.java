package com.prajwalsingh.portfolio.metrics;

import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Unique daily view counter.
 *
 * Reads are served from an AtomicLong rather than the database: the number is
 * decorative, it is requested on every page load, and a counter query per visit is
 * a silly amount of I/O for a footer. It is seeded from the authoritative sum at
 * startup and advanced whenever the ledger reports a genuinely new visitor, so a
 * restart resynchronises it.
 */
@Service
public class ViewCounterService {

    private static final Logger log = LoggerFactory.getLogger(ViewCounterService.class);

    private final ViewRepository views;
    private final VisitorLedger ledger;
    private final AtomicLong cachedTotal = new AtomicLong();

    public ViewCounterService(ViewRepository views, VisitorLedger ledger) {
        this.views = views;
        this.ledger = ledger;
    }

    /**
     * Seeded on ApplicationReadyEvent rather than @PostConstruct. @Transactional is
     * applied by a proxy that does not exist yet during construction, so the
     * annotation on a @PostConstruct method is silently ignored — and the read
     * would run outside a transaction while looking like it runs inside one.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional(readOnly = true)
    public void seed() {
        cachedTotal.set(views.sumTotal());
        log.info("View counter seeded at {}", cachedTotal.get());
    }

    /** @return the running total, whether or not this call was a new visitor */
    public long registerView(String ipHash) {
        return ledger.recordFirstVisitToday(ipHash)
                ? cachedTotal.incrementAndGet()
                : cachedTotal.get();
    }

    public long total() {
        return cachedTotal.get();
    }
}
