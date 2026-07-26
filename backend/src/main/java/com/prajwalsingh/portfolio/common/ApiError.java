package com.prajwalsingh.portfolio.common;

import java.util.Map;

/**
 * The one error shape every endpoint returns.
 *
 * `errors` is keyed by field name so the frontend can drop each message straight
 * under the input that caused it, with no parsing.
 */
public record ApiError(String message, Map<String, String> errors) {

    public static ApiError of(String message) {
        return new ApiError(message, Map.of());
    }

    public static ApiError of(String message, Map<String, String> errors) {
        return new ApiError(message, errors);
    }
}
