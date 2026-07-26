package com.prajwalsingh.portfolio.metrics;

import java.time.LocalDate;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface VisitorSeenRepository extends JpaRepository<VisitorSeen, VisitorSeen.Key> {

    /**
     * Claims today for this visitor, returning 1 if the claim was new and 0 if it
     * was already taken.
     *
     * Native rather than a repository save() for two reasons, both of which broke
     * an earlier version of this class:
     *
     *   1. save() on an entity with an assigned id (here an @EmbeddedId) sees a
     *      non-null id, decides the entity is not new, and calls merge() — which
     *      SELECTs, finds the existing row, and updates it. No constraint is ever
     *      violated, so a duplicate visit looked like a brand-new one and the
     *      counter was really counting raw hits.
     *
     *   2. Even with persist(), catching the resulting violation inside the
     *      transaction does not help: a JPA flush failure marks the transaction
     *      rollback-only, so the commit then throws UnexpectedRollbackException and
     *      the request 500s.
     *
     * ON CONFLICT DO NOTHING sidesteps both. It is supported by PostgreSQL and by
     * H2's INSERT grammar, which is what dev and test run on.
     */
    @Modifying
    @Query(value = """
            insert into visitor_seen (ip_hash, view_date)
            values (:ipHash, :day)
            on conflict do nothing
            """, nativeQuery = true)
    int claimDay(@Param("ipHash") String ipHash, @Param("day") LocalDate day);

    /**
     * Retention. These rows only answer "have I already counted this visitor
     * today", so anything older than a day or two is dead weight — daily_views
     * keeps the history the total is actually derived from.
     */
    @Modifying
    @Query("delete from VisitorSeen v where v.id.day < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDate cutoff);
}
