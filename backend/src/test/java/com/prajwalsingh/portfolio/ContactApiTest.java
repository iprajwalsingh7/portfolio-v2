package com.prajwalsingh.portfolio;

import java.time.Duration;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.prajwalsingh.portfolio.common.RateLimiter;
import com.prajwalsingh.portfolio.contact.ContactRepository;
import com.prajwalsingh.portfolio.contact.MailNotifier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Covers the contract the frontend depends on, plus the two behaviours that are
 * easy to get wrong and invisible when they break: the honeypot has to look like
 * success, and the rate limiter has to eventually say no.
 *
 * Every test uses its own client address and its own email. The rate limiter and
 * the per-address guard are both application-wide singletons, so tests sharing
 * either one would consume each other's budget and fail depending on execution
 * order — the classic way a suite like this turns flaky.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ContactApiTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ContactRepository repository;

    /** Stubbed so no test ever attempts SMTP. */
    @MockitoBean
    MailNotifier notifier;

    /** A valid JSON submission from a named sender. */
    private static String json(String email) {
        return """
                {"name":"Ada Lovelace","email":"%s",
                 "message":"I would like to talk about your trailing stop engine."}
                """.formatted(email);
    }

    /** Binds the request to a specific client address so it gets its own bucket. */
    private static MockHttpServletRequestBuilder from(String ip, String email) {
        return post("/api/contact")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(email))
                .with(request -> {
                    request.setRemoteAddr(ip);
                    return request;
                });
    }

    @Test
    void acceptsAValidSubmissionAndPersistsIt() throws Exception {
        long before = repository.count();

        mvc.perform(from("10.0.0.1", "valid@example.com"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.id").isNotEmpty());

        assertThat(repository.count()).isEqualTo(before + 1);
    }

    @Test
    void reportsFieldErrorsKeyedByFieldName() throws Exception {
        mvc.perform(post("/api/contact")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"A","email":"not-an-email","message":"short"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").isNotEmpty())
                .andExpect(jsonPath("$.errors.email").isNotEmpty())
                .andExpect(jsonPath("$.errors.message").isNotEmpty());
    }

    /**
     * A filled honeypot must return 200 and store nothing. An error response would
     * tell the bot exactly which field to drop next time.
     */
    @Test
    void silentlyDropsHoneypotSubmissions() throws Exception {
        long before = repository.count();

        mvc.perform(post("/api/contact")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Bot","email":"bot@example.com",
                                 "message":"buy cheap backlinks today","company":"spam-co"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        assertThat(repository.count()).isEqualTo(before);
        verify(notifier, never()).notifyOf(any());
    }

    @Test
    void rateLimitsRepeatSubmissionsWithRetryAfter() throws Exception {
        // application-test.yml sets capacity to 2, so the third call must fail.
        for (int i = 0; i < 2; i++) {
            mvc.perform(from("10.0.0.2", "burst@example.com"))
                    .andExpect(status().isOk());
        }

        mvc.perform(from("10.0.0.2", "burst@example.com"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    /** The no-JavaScript path: a native form post must come back as a readable page. */
    @Test
    void acceptsFormEncodedSubmissionsAndRepliesWithHtml() throws Exception {
        mvc.perform(post("/api/contact")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("name", "Grace Hopper")
                        .param("email", "grace@example.com")
                        .param("message", "No JavaScript here, and it still works.")
                        .with(request -> {
                            request.setRemoteAddr("10.0.0.3");
                            return request;
                        }))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", Matchers.containsString("text/html")));
    }

    @Test
    void sendsSecurityHeadersOnEveryResponse() throws Exception {
        mvc.perform(from("10.0.0.4", "headers@example.com"))
                .andExpect(header().exists("Content-Security-Policy"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"));
    }

    /** Guards the assumption the whole limiter rests on: buckets actually refill. */
    @Test
    void rateLimiterRefillsOverTime() throws Exception {
        RateLimiter limiter = new RateLimiter();
        String key = "refill-test";

        assertThat(limiter.tryConsume(key, 1, Duration.ofMillis(120))).isZero();
        assertThat(limiter.tryConsume(key, 1, Duration.ofMillis(120))).isPositive();

        Thread.sleep(250);

        assertThat(limiter.tryConsume(key, 1, Duration.ofMillis(120))).isZero();
    }
}
