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
import org.springframework.test.context.ActiveProfiles;

import com.prajwalsingh.portfolio.metrics.ViewCounterService;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The counter exists to count a visitor once per day. That, and its behaviour
 * under a stampede, are the parts worth asserting.
 */
@SpringBootTest
@ActiveProfiles("test")
class ViewCounterTest {

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
     * The reason the ledger inserts first and reads the constraint violation
     * instead of doing select-then-insert. With the naive version, several of these
     * threads pass the check together and the total overshoots.
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
