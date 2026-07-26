package com.prajwalsingh.portfolio.metrics;

import java.io.Serializable;
import java.time.LocalDate;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Dedupe key: one row per (hashed visitor, day).
 *
 * The composite primary key does the deduplication — a second visit on the same
 * day violates it, and that violation *is* the answer. No read-then-write, so no
 * race between two concurrent requests from the same visitor.
 */
@Entity
@Table(name = "visitor_seen")
public class VisitorSeen {

    @EmbeddedId
    private Key id;

    protected VisitorSeen() {
        // JPA
    }

    public VisitorSeen(String ipHash, LocalDate day) {
        this.id = new Key(ipHash, day);
    }

    public Key getId() {
        return id;
    }

    @Embeddable
    public static class Key implements Serializable {

        @Column(name = "ip_hash", nullable = false, length = 64)
        private String ipHash;

        // Not "day": DAY is a reserved word in H2 and in SQL:2016. Hibernate quotes
        // reserved identifiers in the SQL it generates, so JPQL survives either way —
        // but the hand-written native upserts do not, and they fail to parse.
        @Column(name = "view_date", nullable = false)
        private LocalDate day;

        protected Key() {
            // JPA
        }

        public Key(String ipHash, LocalDate day) {
            this.ipHash = ipHash;
            this.day = day;
        }

        public String getIpHash() {
            return ipHash;
        }

        public LocalDate getDay() {
            return day;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            }
            if (!(o instanceof Key other)) {
                return false;
            }
            return Objects.equals(ipHash, other.ipHash) && Objects.equals(day, other.day);
        }

        @Override
        public int hashCode() {
            return Objects.hash(ipHash, day);
        }
    }
}
