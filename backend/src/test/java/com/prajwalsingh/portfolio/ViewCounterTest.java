package com.prajwalsingh.portfolio;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.prajwalsingh.portfolio.metrics.ViewCounterService;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The view counter, against a real Postgres.
 *
 * Not H2, on purpose. The dedupe is built on `insert ... on conflict do nothing`
 * and reads the affected-row count as its answer — that is Postgres behaviour, so
 * asserting it against a different database's SQL dialect proves nothing about
 * production. An earlier version of these tests ran on H2 and failed on a
 * dialect difference (DAY is a reserved word there) that production would never
 * have hit, which is exactly the wrong way round.
 *
 * Running here also means the Flyway migration is executed for real, so
 * V1__init.sql is verified against the entity mappings rather than assumed.
 */
@SpringBootTest
@Testcontainers
@ActiveProfiles("pg")
class ViewCounterTest {

    /**
     * One container for the whole class. `static` matters: a per-test container
     * would pay the startup cost on every method.
     */
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    ViewCounterService counter;

    @Test
    void countsAVisitorOncePerDay() {
        long start = counter.total();

        assertThat(counter.registerView("visitor-a")).isEqualTo(start + 1);

        // Same visitor, same day: the total must not move.
        assertThat(counter.registerView("visitor-a")).isEqualTo(start + 1);

        // A different visitor does move it.
        assertThat(counter.registerView("visitor-b")).isEqualTo(start + 2);
    }

    /**
     * Why the ledger inserts and reads the affected-row count instead of doing
     * select-then-insert: with the naive version several of these threads pass the
     * existence check together and the total overshoots.
     */
    @Test
    void concurrentVisitsFromOneVisitorCountOnce() throws Exception {
        long start = counter.total();

        List<Callable<Long>> tasks = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            tasks.add(() -> counter.registerView("stampede"));
        }

        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (Future<Long> future : pool.invokeAll(tasks)) {
                future.get();
            }
        }

        assertThat(counter.total()).isEqualTo(start + 1);
    }
}
