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
 * Cache policy, split by how mutable each thing is.
 *
 * The distinction that matters:
 *
 *   /assets/*  Vite content-hashes these, so the filename changes whenever the
 *              bytes do. They can be cached for a year and marked immutable —
 *              a returning visitor revalidates nothing at all.
 *
 *   index.html Must never be cached that way. It is the file that names the
 *              current hashed assets, so caching it would make a deploy
 *              invisible to anyone who had already visited.
 *
 *   /fonts/*   Stable names but genuinely immutable content, and a new subset
 *              would ship under a new name.
 *
 * Anything under /api sets its own headers in the controller, so it is skipped.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class CacheHeadersFilter extends OncePerRequestFilter {

    private static final String IMMUTABLE = "public, max-age=31536000, immutable";
    private static final String MONTH = "public, max-age=2592000";
    private static final String REVALIDATE = "no-cache, must-revalidate";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        String path = request.getRequestURI();
        String policy = policyFor(path);
        if (policy != null) {
            response.setHeader("Cache-Control", policy);
        }

        chain.doFilter(request, response);
    }

    /** @return the Cache-Control value, or null to leave the response untouched */
    private static String policyFor(String path) {
        if (path.startsWith("/api/") || path.startsWith("/actuator")) {
            return null;
        }
        if (path.startsWith("/assets/") || path.startsWith("/fonts/")) {
            return IMMUTABLE;
        }
        if (path.equals("/") || path.equals("/index.html")) {
            return REVALIDATE;
        }
        if (path.endsWith(".svg") || path.endsWith(".pdf")
                || path.endsWith(".txt") || path.endsWith(".xml")
                || path.endsWith(".ico")) {
            return MONTH;
        }
        return null;
    }
}
