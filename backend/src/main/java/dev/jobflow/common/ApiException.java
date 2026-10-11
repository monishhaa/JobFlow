package dev.jobflow.common;

public class ApiException extends RuntimeException {
    public final int status;
    public final String code;
    public final Integer retryAfter;

    public ApiException(int status, String code, String message) { this(status, code, message, null); }

    public ApiException(int status, String code, String message, Integer retryAfter) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfter = retryAfter;
    }

    public static ApiException notFound(String what) { return new ApiException(404, "NOT_FOUND", what + " not found"); }
    public static ApiException bad(String msg) { return new ApiException(400, "BAD_REQUEST", msg); }
    public static ApiException conflict(String msg) { return new ApiException(409, "INVALID_STATE", msg); }
    public static ApiException unauthorized(String msg) { return new ApiException(401, "UNAUTHORIZED", msg); }
}
