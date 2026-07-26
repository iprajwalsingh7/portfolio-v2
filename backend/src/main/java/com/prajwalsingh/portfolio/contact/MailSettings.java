package com.prajwalsingh.portfolio.contact;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;

import com.prajwalsingh.portfolio.config.AppProperties;

/**
 * Resolves the sender address and audits the mail setup at startup.
 *
 * This exists because every way mail configuration goes wrong is invisible at the
 * point of failure. Sending happens asynchronously, after the visitor already saw
 * "message sent", so a rejected relay shows up as nothing at all — no error page,
 * no failed request, just an inbox that stays empty. Checking at startup turns
 * that into one obvious line in the logs.
 *
 * The From address is the usual culprit. Gmail (and most relays with SPF/DKIM
 * enforcement) will only accept a From that is the authenticated account or a
 * verified alias. Setting it to something like no-reply@yourdomain.dev looks
 * reasonable and gets every message rejected with 5.7.001.
 */
@Component
public class MailSettings {

    private static final Logger log = LoggerFactory.getLogger(MailSettings.class);

    private final AppProperties props;
    private final ObjectProvider<JavaMailSender> senders;
    private final String smtpUsername;

    public MailSettings(AppProperties props,
                        ObjectProvider<JavaMailSender> senders,
                        @Value("${spring.mail.username:}") String smtpUsername) {
        this.props = props;
        this.senders = senders;
        this.smtpUsername = smtpUsername == null ? "" : smtpUsername.trim();
    }

    /**
     * The address to put in From.
     *
     * Falls back to the SMTP account when `portfolio.contact.from` is blank, which
     * is the setting most likely to be accepted by any relay.
     */
    public String fromAddress() {
        String configured = props.contact().from();
        return configured == null || configured.isBlank() ? smtpUsername : configured.trim();
    }

    public boolean enabled() {
        return props.contact().mailEnabled();
    }

    /**
     * Logs exactly what is wrong, if anything. Deliberately does not throw:
     * submissions are persisted before mail is attempted, so a broken relay must
     * not stop the site from serving.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void audit() {
        if (!enabled()) {
            log.info("Contact mail is disabled. Submissions are stored in contact_message "
                    + "and can be read from there. Set CONTACT_MAIL_ENABLED=true to send.");
            return;
        }

        JavaMailSender sender = senders.getIfAvailable();
        if (sender == null) {
            log.error("CONTACT_MAIL_ENABLED=true but no JavaMailSender exists — set MAIL_HOST. "
                    + "Messages will still be stored.");
            return;
        }

        if (smtpUsername.isBlank()) {
            log.error("CONTACT_MAIL_ENABLED=true but MAIL_USERNAME is empty. "
                    + "Gmail and most relays require authentication.");
            return;
        }

        String from = fromAddress();
        String host = sender instanceof JavaMailSenderImpl impl ? String.valueOf(impl.getHost()) : "";

        // The single most common misconfiguration, and the most silent.
        if (host.contains("gmail") && !from.equalsIgnoreCase(smtpUsername)) {
            log.error("""
                    Gmail will reject mail sent as <{}> from the account <{}>.
                    Set CONTACT_FROM to the same address as MAIL_USERNAME, or add it as a
                    verified alias under Gmail Settings > Accounts > Send mail as.""",
                    from, smtpUsername);
            return;
        }

        if (host.contains("gmail") && props.contact().notifyTo().equalsIgnoreCase(smtpUsername)) {
            log.info("Notifications are sent from and to <{}>. Gmail hides a message you sent "
                    + "to yourself from the inbox — look in All Mail if it seems missing.", smtpUsername);
        }

        log.info("Contact mail ready: {} -> {} via {}", from, props.contact().notifyTo(), host);
    }
}
