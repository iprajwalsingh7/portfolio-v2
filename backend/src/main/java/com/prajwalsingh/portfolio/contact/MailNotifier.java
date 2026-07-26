package com.prajwalsingh.portfolio.contact;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import com.prajwalsingh.portfolio.config.AppProperties;

/**
 * Sends the "you have a message" notification.
 *
 * Deliberately fire-and-forget:
 *   - @Async so the visitor's request returns as soon as the row is committed,
 *     instead of waiting on an SMTP handshake that can take seconds
 *   - failures are logged, never rethrown — the submission is already persisted,
 *     so a mail outage must not surface as an error to the visitor
 *
 * The sender is injected as an ObjectProvider because Boot only auto-configures a
 * JavaMailSender when `spring.mail.host` is set. Requiring the bean directly would
 * mean the app refuses to start in any profile without SMTP configured — including
 * local development, where sending mail is the last thing you want.
 *
 * Reply-To carries the visitor's address, so replying from the inbox reaches them.
 * From stays a mailbox the relay is authorised for; spoofing the visitor's domain
 * there is what gets mail classified as spam.
 */
@Component
public class MailNotifier {

    private static final Logger log = LoggerFactory.getLogger(MailNotifier.class);

    private final ObjectProvider<JavaMailSender> mailSender;
    private final ContactRepository repository;
    private final MailSettings settings;
    private final AppProperties props;

    public MailNotifier(ObjectProvider<JavaMailSender> mailSender,
                        ContactRepository repository,
                        MailSettings settings,
                        AppProperties props) {
        this.mailSender = mailSender;
        this.repository = repository;
        this.settings = settings;
        this.props = props;
    }

    @Async
    public void notifyOf(ContactMessage message) {
        AppProperties.Contact cfg = props.contact();

        if (!cfg.mailEnabled()) {
            log.info("Mail disabled; contact {} from {} stored only",
                    message.getId(), message.getEmail());
            return;
        }

        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null) {
            log.error("Mail is enabled but no JavaMailSender is configured — set spring.mail.host. "
                    + "Contact {} is stored and retrievable from contact_message.", message.getId());
            return;
        }

        SimpleMailMessage mail = new SimpleMailMessage();
        mail.setFrom(settings.fromAddress());
        mail.setTo(cfg.notifyTo());
        mail.setReplyTo(message.getEmail());
        mail.setSubject(cfg.subject() + message.getName());
        mail.setText("""
                %s <%s>

                %s

                —
                id       %s
                received %s
                """.formatted(
                message.getName(),
                message.getEmail(),
                message.getBody(),
                message.getId(),
                message.getCreatedAt()));

        try {
            sender.send(mail);
            repository.markNotified(message.getId());
            log.info("Notified for contact {}", message.getId());
        } catch (MailException e) {
            // The message is safe in the database; this is recoverable by hand.
            log.error("Could not send notification for contact {} — it is stored and can be "
                    + "retrieved from the contact_message table", message.getId(), e);
        }
    }
}
