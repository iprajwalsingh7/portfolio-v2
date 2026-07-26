package com.prajwalsingh.portfolio.metrics;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One row per day holding that day's unique-visitor count. */
@Entity
@Table(name = "daily_views")
public class DailyViews {

    @Id
    // Not "day": DAY is a reserved word in H2 and in SQL:2016. Hibernate quotes
    // reserved identifiers in the SQL it generates, so JPQL survives either way —
    // but the hand-written native upserts do not, and they fail to parse.
    @Column(name = "view_date", nullable = false)
    private LocalDate day;

    @Column(name = "total", nullable = false)
    private long total;

    protected DailyViews() {
        // JPA
    }

    public DailyViews(LocalDate day, long total) {
        this.day = day;
        this.total = total;
    }

    public LocalDate getDay() {
        return day;
    }

    public long getTotal() {
        return total;
    }
}
