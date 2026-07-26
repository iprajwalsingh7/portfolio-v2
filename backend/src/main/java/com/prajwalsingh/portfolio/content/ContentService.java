package com.prajwalsingh.portfolio.content;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

/**
 * Serves content.json — the same file the frontend prerenders from.
 *
 * The build copies frontend/content.json into this module's resources, so the
 * page and the API can never disagree. Read once at startup and held as a String:
 * it is a few kilobytes, it never changes at runtime, and returning it verbatim
 * avoids a parse-then-reserialise round trip on every request.
 */
@Service
public class ContentService {

    private static final Logger log = LoggerFactory.getLogger(ContentService.class);
    private static final String LOCATION = "content.json";

    // Written once during startup, then read from every request thread. volatile
    // states that intent rather than relying on container publication.
    private volatile String json = "{}";
    private volatile String etag = "\"empty\"";

    @PostConstruct
    void load() {
        ClassPathResource resource = new ClassPathResource(LOCATION);
        if (!resource.exists()) {
            // Only happens if the backend is built without running the frontend
            // prerender first. Degrade instead of refusing to start.
            log.warn("{} missing from the classpath — /api/content will return an empty object. "
                    + "Run the frontend build first.", LOCATION);
            return;
        }
        try (InputStream in = resource.getInputStream()) {
            json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            etag = "\"" + Integer.toHexString(json.hashCode()) + "\"";
            log.info("Loaded {} ({} bytes)", LOCATION, json.length());
        } catch (IOException e) {
            throw new IllegalStateException("Could not read " + LOCATION, e);
        }
    }

    public String json() {
        return json;
    }

    /** Weak-ish ETag over the payload, so conditional GETs cost 304 not 200. */
    public String etag() {
        return etag;
    }
}
