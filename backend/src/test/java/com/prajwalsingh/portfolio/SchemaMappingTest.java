package com.prajwalsingh.portfolio;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Asserts the Flyway schema and the JPA mappings agree.
 *
 * `ddl-auto: validate` makes Hibernate compare every entity against the schema
 * Flyway just built and refuse to start on a mismatch. If the context loads, they
 * match — so the test body is empty on purpose.
 *
 * This check exists because its absence cost a debugging round: the entities named
 * a column `view_date` while the migration created `view_day`, and nothing
 * complained until a query happened to touch it. The failure then pointed at the
 * query rather than at the mismatch that caused it.
 *
 * Deliberately isolated in its own class rather than switched on in the shared `pg`
 * profile. The validator compares column type names as text and is known to
 * disagree with Postgres over harmless spelling differences (`timestamptz` versus
 * `timestamp with time zone`). If it turns out to be over-strict, only this test
 * fails and the behavioural tests stay meaningful.
 */
@SpringBootTest
@Testcontainers
@ActiveProfiles("pg")
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=validate")
class SchemaMappingTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void flywaySchemaMatchesTheEntityMappings() {
        // Reaching this point means Hibernate validated the schema successfully.
    }
}
