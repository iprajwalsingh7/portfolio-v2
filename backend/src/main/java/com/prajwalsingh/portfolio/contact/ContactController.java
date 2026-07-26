package com.prajwalsingh.portfolio.contact;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.prajwalsingh.portfolio.common.ClientIdentity;

/**
 * POST /api/contact
 *
 * Two content types on purpose:
 *   - application/json   for the fetch-based form (the normal path)
 *   - form-urlencoded    for the same form with JavaScript disabled, where the
 *                        browser submits natively and needs a page back
 *
 * The second mapping is what makes the form genuinely progressive rather than
 * progressive-in-principle. It is a few lines, and it means the contact form works
 * in a text browser, with a broken bundle, or behind a script blocker.
 */
@RestController
@RequestMapping("/api/contact")
public class ContactController {

    private final ContactService service;
    private final ClientIdentity identity;

    public ContactController(ContactService service, ClientIdentity identity) {
        this.service = service;
        this.identity = identity;
    }

    public record Accepted(boolean ok, String id) {}

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE,
                 produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Accepted> submitJson(@Valid @RequestBody ContactRequest body,
                                               HttpServletRequest request) {
        ContactService.Receipt receipt = service.submit(
                body, identity.hash(request), request.getHeader("User-Agent"));

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new Accepted(true, receipt.id()));
    }

    @PostMapping(consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE,
                 produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> submitForm(@Valid ContactRequest form,
                                             HttpServletRequest request) {
        service.submit(form, identity.hash(request), request.getHeader("User-Agent"));

        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .cacheControl(CacheControl.noStore())
                .body(page("Message sent",
                        "Thanks — it landed. I usually reply within a day."));
    }

    /**
     * Minimal standalone confirmation page for the no-JavaScript path.
     *
     * Inlined rather than templated: adding Thymeleaf to render one static page
     * would cost more than it returns. Nothing here interpolates user input, so
     * there is no injection surface.
     */
    private static String page(String title, String body) {
        return """
                <!doctype html>
                <html lang="en"><head><meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>%s</title>
                <style>
                  body{margin:0;min-height:100vh;display:grid;place-items:center;
                       background:#0b0b0c;color:#efede8;
                       font:400 16px/1.6 system-ui,sans-serif;text-align:center;padding:24px}
                  h1{font-size:clamp(28px,6vw,54px);letter-spacing:-.04em;margin:0 0 14px}
                  p{color:#a3a1a6;margin:0 0 30px}
                  a{color:#c8ff4d;text-decoration:none;border-bottom:1px solid #3d4d1d;
                    padding-bottom:2px;font-size:13px;letter-spacing:.1em;text-transform:uppercase}
                </style></head>
                <body><main><h1>%s</h1><p>%s</p><a href="/">Back to the site</a></main></body></html>
                """.formatted(title, title, body);
    }
}
