package com.prajwalsingh.portfolio;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * content.json is copied into this module by the frontend build, so this also
 * fails loudly if someone packages the backend without running that build.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ContentApiTest {

    @Autowired
    MockMvc mvc;

    @Test
    void servesTheSameContentThePageIsBuiltFrom() throws Exception {
        mvc.perform(get("/api/content"))
                .andExpect(status().isOk())
                .andExpect(header().exists("ETag"))
                .andExpect(jsonPath("$.meta.name").value("Prajwal Singh"))
                .andExpect(jsonPath("$.projects").isArray())
                .andExpect(jsonPath("$.stack").isArray());
    }

    @Test
    void healthEndpointIsUp() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
