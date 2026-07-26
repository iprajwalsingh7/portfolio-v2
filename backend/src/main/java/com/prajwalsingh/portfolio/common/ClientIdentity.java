package com.prajwalsingh.portfolio.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Set;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import com.prajwalsingh.portfolio.config.AppProperties;

/**
 * Derives a stable, non-reversible visitor key from the request.
 *
 * Raw IP addresses are personal data and this site has no reason to keep them.
 * What the counter and the rate limiter need is only "is this the same caller as
 * before", which a salted SHA-256 answers.
 */
@Component
public class ClientIdentity {

    /** Salts that must never reach production. */
    private static final Set<String> PLACEHOLDER_SALTS =
            Set.of("change-me-in-production", "dev-only-salt", "test-salt", "");

    private final byte[] salt;

    public ClientIdentity(AppProperties props, Environment environment) {
        String configured = props.privacy().ipSalt();

        // Fail at startup rather than quietly hashing with a known value. With a
        // known salt, hashing the entire IPv4 space is minutes of work, so every
        // stored hash becomes reversible and the privacy property is gone.
        boolean production = environment.matchesProfiles("prod");
        if (production && PLACEHOLDER_SALTS.contains(configured)) {
            throw new IllegalStateException(
                    "portfolio.privacy.ip-salt is unset or still the placeholder value. "
                            + "Set IP_SALT to a random secret (openssl rand -hex 32).");
        }

        this.salt = configured.getBytes(StandardCharsets.UTF_8);
    }

    /** Hex SHA-256 of salt + client address. 64 characters. */
    public String hash(HttpServletRequest request) {
        return sha256(salt, clientAddress(request).getBytes(StandardCharsets.UTF_8));
    }

    /**
     * The client address.
     *
     * No X-Forwarded-For parsing here on purpose. `server.forward-headers-strategy:
     * framework` installs Spring's ForwardedHeaderFilter, which consumes the
     * X-Forwarded-* headers and rewrites the request so getRemoteAddr() already
     * returns the original client. Parsing the header again here would be dead code
     * at best, and at worst would trust a header the filter had deliberately
     * discarded.
     *
     * This does mean the app must sit behind exactly one proxy it controls.
     * X-Forwarded-For is client-supplied, so anything able to reach the app
     * directly could forge an address and get a fresh rate-limit bucket.
     */
    private String clientAddress(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        return remote == null || remote.isBlank() ? "unknown" : remote;
    }

    private static String sha256(byte[] salt, byte[] value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(salt);
            digest.update(value);
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the JDK specification; unreachable.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
