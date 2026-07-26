package com.prajwalsingh.portfolio.config;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Baseline security headers.
 *
 * Spring Security would supply these, but pulling in the whole framework for a
 * site with no authentication is not a trade worth making — this filter is the
 * entire surface.
 *
 * The CSP is strict and the page is built to satisfy it: no third-party origins
 * (fonts are self-hosted), no inline event handlers, no eval. Two inline blocks
 * do exist in index.html — the no-js class removal and the JSON-LD — so
 * 'unsafe-inline' is required for style-src and script-src. If that bothers you,
 * switch the prerenderer to emit a nonce per response instead.
 */
@Component
// Deliberately one step after HIGHEST_PRECEDENCE, which is where Boot registers
// ForwardedHeaderFilter. That filter has to run first, because request.isSecure()
// only reflects X-Forwarded-Proto once it has. Sharing an order value leaves the
// sequence unspecified and makes HSTS come and go behind a TLS proxy.
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class SecurityHeadersFilter extends OncePerRequestFilter {

    private static final String CSP = String.join("; ",
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "form-action 'self'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
            "object-src 'none'");

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        response.setHeader("Content-Security-Policy", CSP);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        response.setHeader("Permissions-Policy",
                "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin");

        // Only meaningful over TLS; harmless otherwise, and terminating proxies
        // forward it as-is.
        if (request.isSecure()) {
            response.setHeader("Strict-Transport-Security",
                    "max-age=31536000; includeSubDomains");
        }

        chain.doFilter(request, response);
    }
}
