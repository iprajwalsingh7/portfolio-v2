package com.prajwalsingh.portfolio.metrics;

import java.time.LocalDate;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ViewRepository extends JpaRepository<DailyViews, LocalDate> {

    /**
     * Atomic increment. The read and the write happen inside the database in one
     * statement, so concurrent callers serialise on the row lock rather than
     * clobbering each other — which is what a load-modify-save through the entity
     * would do.
     *
     * @return rows affected; 0 means today has no row yet
     */
    @Modifying
    @Query("update DailyViews d set d.total = d.total + 1 where d.day = :day")
    int increment(@Param("day") LocalDate day);

    /**
     * Creates today's row if it does not exist. Native ON CONFLICT DO NOTHING
     * rather than save(): DailyViews also has an assigned id, so save() would
     * merge() and overwrite an existing total with 1 — losing the day's count
     * instead of failing loudly.
     *
     * @return 1 if this call created the row, 0 if another request got there first
     */
    @Modifying
    @Query(value = """
            insert into daily_views (day, total)
            values (:day, 1)
            on conflict do nothing
            """, nativeQuery = true)
    int createDay(@Param("day") LocalDate day);

    @Query("select coalesce(sum(d.total), 0) from DailyViews d")
    long sumTotal();
}
