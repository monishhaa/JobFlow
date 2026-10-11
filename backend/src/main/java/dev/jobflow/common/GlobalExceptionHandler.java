package dev.jobflow.common;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static ResponseEntity<ApiError> body(int status, String code, String msg, Object details, Integer retryAfter) {
        var b = ResponseEntity.status(status);
        if (retryAfter != null) b.header("Retry-After", String.valueOf(retryAfter));
        return b.body(new ApiError(code, msg, details, MDC.get("traceId")));
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> api(ApiException e) { return body(e.status, e.code, e.getMessage(), null, e.retryAfter); }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> invalid(MethodArgumentNotValidException e) {
        Map<String, String> d = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors().forEach(f -> d.put(f.getField(), f.getDefaultMessage()));
        return body(400, "VALIDATION_FAILED", "Request validation failed", d, null);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, IllegalArgumentException.class})
    ResponseEntity<ApiError> unreadable(Exception e) { return body(400, "BAD_REQUEST", "Malformed or invalid request", null, null); }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiError> denied(AccessDeniedException e) { return body(403, "FORBIDDEN", "Access denied", null, null); }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> other(Exception e) {
        if (e instanceof ErrorResponse er) {
            HttpStatusCode sc = er.getStatusCode();
            return body(sc.value(), HttpStatus.valueOf(sc.value()).name(), HttpStatus.valueOf(sc.value()).getReasonPhrase(), null, null);
        }
        log.error("Unhandled error", e);
        return body(500, "INTERNAL_ERROR", "Unexpected error", null, null);
    }
}
