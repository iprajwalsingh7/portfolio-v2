package com.prajwalsingh.portfolio.contact;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public interface ContactRepository extends JpaRepository<ContactMessage, String> {

    /** Second line of defence behind the rate limiter, per address rather than per IP. */
    long countByEmailAndCreatedAtAfter(String email, Instant since);

    /**
     * Records that the notification email went out.
     *
     * A direct update rather than mutating the entity: MailNotifier runs
     * asynchronously and holds a detached instance, so a setter there would change
     * nothing. @Transactional is on the method because the caller is an @Async
     * method with no surrounding transaction.
     */
    @Modifying
    @Transactional
    @Query("update ContactMessage m set m.notified = true where m.id = :id")
    int markNotified(@Param("id") String id);
}
