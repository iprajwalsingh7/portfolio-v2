package com.prajwalsingh.portfolio.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * All tunable behaviour in one typed place, bound from `portfolio.*`.
 *
 * Records give immutability for free, and the configuration processor turns the
 * javadoc into IDE metadata.
 */
@ConfigurationProperties(prefix = "portfolio")
public record AppProperties(

        @DefaultValue("https://prajwalsingh.dev") String siteUrl,

        @DefaultValue Contact contact,
        @DefaultValue RateLimit rateLimit,
        @DefaultValue Privacy privacy,
        @DefaultValue Cors cors
) {

    /**
     * @param notifyTo   inbox that receives contact submissions
     * @param from       envelope sender. Leave blank to use spring.mail.username.
     *                   It must be a mailbox the relay is authorised to send as —
     *                   Gmail rejects anything that is not the authenticated
     *                   account or a verified "Send mail as" alias
     * @param subject    subject prefix for notification mail
     * @param mailEnabled set false to persist submissions without sending mail
     */
    public record Contact(
            @DefaultValue("prajwalsingh0605@gmail.com") String notifyTo,
            @DefaultValue("") String from,
            @DefaultValue("[portfolio] ") String subject,
            @DefaultValue("false") boolean mailEnabled
    ) {}

    /**
     * Token bucket applied per client IP.
     *
     * @param capacity max submissions available in a burst
     * @param refill   how long a fully drained bucket takes to refill
     */
    public record RateLimit(
            @DefaultValue("3") int capacity,
            @DefaultValue("PT1H") Duration refill
    ) {}

    /**
     * @param ipSalt secret mixed into IP hashes. Override in production —
     *               without a per-deployment salt the hashes are trivially
     *               reversible by brute-forcing the IPv4 space.
     */
    public record Privacy(
            @DefaultValue("change-me-in-production") String ipSalt
    ) {}

    /** Dev only: the Vite server runs on a different origin. */
    public record Cors(
            @DefaultValue({"http://localhost:5173", "http://localhost:4173"})
            List<String> allowedOrigins
    ) {}
}
