package com.prajwalsingh.portfolio.contact;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * A persisted submission.
 *
 * The database is the source of truth, not the notification email. If SMTP is
 * down, misconfigured, or the mail lands in spam, the message is still here — so a
 * mail failure never costs a lead.
 *
 * ipHash is stored instead of the address itself: enough to spot abuse, not enough
 * to identify anyone.
 */
@Entity
@Table(name = "contact_message", indexes = {
        @Index(name = "idx_contact_created", columnList = "created_at"),
        @Index(name = "idx_contact_email", columnList = "email")
})
public class ContactMessage {

    @Id
    @Column(name = "id", nullable = false, length = 36)
    private String id;

    @Column(name = "name", nullable = false, length = 80)
    private String name;

    @Column(name = "email", nullable = false, length = 180)
    private String email;

    @Column(name = "body", nullable = false, length = 4000)
    private String body;

    @Column(name = "ip_hash", length = 64)
    private String ipHash;

    @Column(name = "user_agent", length = 300)
    private String userAgent;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "notified", nullable = false)
    private boolean notified;

    protected ContactMessage() {
        // JPA
    }

    public static ContactMessage from(ContactRequest request, String ipHash, String userAgent) {
        ContactMessage m = new ContactMessage();
        m.id = UUID.randomUUID().toString();
        m.name = request.name();
        m.email = request.email();
        m.body = request.message();
        m.ipHash = ipHash;
        // Trim rather than reject: a freakishly long UA is not the visitor's fault.
        m.userAgent = userAgent == null ? null
                : userAgent.substring(0, Math.min(userAgent.length(), 300));
        m.createdAt = Instant.now();
        m.notified = false;
        return m;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public String getBody() {
        return body;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isNotified() {
        return notified;
    }
}
