package com.prajwalsingh.portfolio.common;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Turns exceptions into the ApiError shape.
 *
 * Two rules: never leak an internal message to the client, and always log the
 * cause server-side with enough context to find it again.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * A missing static file must stay a 404.
     *
     * This handler exists because of the catch-all below. @ControllerAdvice
     * participates in the global exception-resolver chain, not just in controller
     * dispatch, so without an explicit case here NoResourceFoundException would fall
     * through to Exception.class and every request for a file that does not exist
     * would answer 500.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> onMissingResource(NoResourceFoundException ex) {
        log.debug("No resource for {}", ex.getResourcePath());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiError.of("Not found."));
    }

    /** Bean Validation failures on @Valid request bodies. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> onInvalid(MethodArgumentNotValidException ex) {
        return ResponseEntity.badRequest().body(fieldErrors(ex.getBindingResult().getFieldErrors()));
    }

    /**
     * Bean Validation failures on form-encoded (@ModelAttribute) submissions — the
     * no-JavaScript path. MethodArgumentNotValidException extends BindException, so
     * the more specific handler above still wins for JSON bodies.
     */
    @ExceptionHandler(BindException.class)
    public ResponseEntity<ApiError> onBindFailure(BindException ex) {
        return ResponseEntity.badRequest().body(fieldErrors(ex.getFieldErrors()));
    }

    /** Malformed or empty JSON body. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> onUnreadable(HttpMessageNotReadableException ex) {
        log.debug("Unreadable request body", ex);
        return ResponseEntity.badRequest().body(ApiError.of("Could not read that request."));
    }

    @ExceptionHandler(RateLimitedException.class)
    public ResponseEntity<ApiError> onRateLimited(RateLimitedException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.retryAfterSeconds()))
                .body(ApiError.of(ex.getMessage()));
    }

    /**
     * Last resort.
     *
     * The ErrorResponse check matters more than it looks. @ControllerAdvice handlers
     * run before Spring's own DefaultHandlerExceptionResolver, so without this the
     * catch-all would swallow every framework exception that already carries a
     * correct status — 405, 406, 415, missing-parameter 400s — and answer 500. The
     * visible symptom was a POST with the wrong Content-Type returning 500 instead
     * of 415, while logging at ERROR and burying genuine failures.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> onUnexpected(Exception ex) {
        if (ex instanceof ErrorResponse response) {
            log.debug("Request rejected: {}", ex.getMessage());
            return ResponseEntity.status(response.getStatusCode())
                    .body(ApiError.of("That request could not be handled."));
        }
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiError.of("Something broke on my side. Try email instead."));
    }

    /** First message per field wins — showing three at once is noise. */
    private static ApiError fieldErrors(List<FieldError> errors) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError error : errors) {
            fields.putIfAbsent(error.getField(), error.getDefaultMessage());
        }
        return ApiError.of("Some fields need attention.", fields);
    }
}
