package com.prajwalsingh.portfolio;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.prajwalsingh.portfolio.config.AppProperties;

/**
 * Serves the prerendered site plus three small APIs: content, contact intake,
 * and view metrics.
 *
 * Runs on virtual threads (see application.yml). The workload here is almost
 * entirely blocking I/O — a Postgres round trip and an SMTP handshake — which is
 * exactly what virtual threads are for: platform threads stop being the limit on
 * concurrency, so a tiny container handles bursts without a tuned thread pool.
 */
@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
@EnableAsync
@EnableScheduling
public class PortfolioApplication {

    public static void main(String[] args) {
        SpringApplication.run(PortfolioApplication.class, args);
    }
}
