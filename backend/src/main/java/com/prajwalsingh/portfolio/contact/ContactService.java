package com.prajwalsingh.portfolio.contact;

import java.time.Duration;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.prajwalsingh.portfolio.common.RateLimitedException;
import com.prajwalsingh.portfolio.common.RateLimiter;
import com.prajwalsingh.portfolio.config.AppProperties;

/**
 * Contact intake.
 *
 * Three independent brakes, because a public form on a public site will be found:
 *   1. honeypot        — catches naive bots for free, no false positives
 *   2. per-IP bucket   — catches a single noisy source
 *   3. per-email count — catches a distributed source reusing one address
 *
 * Order matters. The honeypot check runs before anything that touches the database
 * or consumes a rate-limit token, so bot traffic costs almost nothing.
 */
@Service
public class ContactService {

    private static final Logger log = LoggerFactory.getLogger(ContactService.class);
    private static final Duration EMAIL_WINDOW = Duration.ofHours(24);
    private static final long MAX_PER_EMAIL_PER_DAY = 5;

    private final ContactRepository repository;
    private final MailNotifier notifier;
    private final RateLimiter limiter;
    private final AppProperties props;

    public ContactService(ContactRepository repository,
                          MailNotifier notifier,
                          RateLimiter limiter,
                          AppProperties props) {
        this.repository = repository;
        this.notifier = notifier;
        this.limiter = limiter;
        this.props = props;
    }

    /** Outcome of an accepted submission. `stored` is false for silently dropped bot traffic. */
    public record Receipt(String id, boolean stored) {}

    public Receipt submit(ContactRequest request, String ipHash, String userAgent) {
        if (request.looksAutomated()) {
            // Answer as though it worked. A bot that gets a 400 just retries
            // without the field; one that gets a 200 moves on.
            log.debug("Dropped honeypot submission from {}", ipHash);
            return new Receipt("dropped", false);
        }

        AppProperties.RateLimit limits = props.rateLimit();
        limiter.require("contact:" + ipHash, limits.capacity(), limits.refill(),
                "That is a few too many messages. Try again a bit later.");

        guardPerEmail(request.email());

        // Spring Data's save() is already transactional, and this is a single
        // insert, so wrapping it in another @Transactional method on this bean
        // would buy nothing — and would not even take effect, since a call from
        // inside the same object bypasses the proxy that applies the annotation.
        ContactMessage saved = repository.save(ContactMessage.from(request, ipHash, userAgent));

        // Notify after the insert has committed, so the mail thread can never
        // race ahead of the row it describes.
        notifier.notifyOf(saved);

        log.info("Stored contact {} from {}", saved.getId(), saved.getEmail());
        return new Receipt(saved.getId(), true);
    }

    private void guardPerEmail(String email) {
        Instant since = Instant.now().minus(EMAIL_WINDOW);
        long recent = repository.countByEmailAndCreatedAtAfter(email, since);
        if (recent >= MAX_PER_EMAIL_PER_DAY) {
            throw new RateLimitedException(
                    "I already have several messages from this address today.",
                    EMAIL_WINDOW.toSeconds());
        }
    }
}
