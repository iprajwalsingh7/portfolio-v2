package com.prajwalsingh.portfolio.content;

import java.time.Duration;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only view of the site's content.
 *
 * The page itself does not call this — it is prerendered. This exists so the
 * content has a real API surface: useful for a CV generator, another frontend, or
 * simply checking what is deployed.
 */
@RestController
@RequestMapping("/api/content")
public class ContentController {

    private final ContentService content;

    public ContentController(ContentService content) {
        this.content = content;
    }

    @GetMapping
    public ResponseEntity<String> get() {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .eTag(content.etag())
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic())
                .body(content.json());
    }
}
