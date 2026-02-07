// src/lib/api/errors.ts

/**
 * Base API error class
 */
export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details?: unknown;

    constructor(message: string, statusCode: number, code: string, details?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

/**
 * 400 Bad Request - Invalid request data
 */
export class ValidationError extends ApiError {
    constructor(message: string = 'Validation failed', details?: unknown) {
        super(message, 400, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}

/**
 * 401 Unauthorized - Missing or invalid authentication
 */
export class AuthenticationError extends ApiError {
    constructor(message: string = 'Authentication required') {
        super(message, 401, 'AUTHENTICATION_ERROR');
        this.name = 'AuthenticationError';
    }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class AuthorizationError extends ApiError {
    constructor(message: string = 'Access denied', details?: unknown) {
        super(message, 403, 'AUTHORIZATION_ERROR', details);
        this.name = 'AuthorizationError';
    }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends ApiError {
    constructor(resource: string = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND');
        this.name = 'NotFoundError';
    }
}

/**
 * 409 Conflict - Resource already exists or conflict
 */
export class ConflictError extends ApiError {
    constructor(message: string = 'Resource already exists') {
        super(message, 409, 'CONFLICT');
        this.name = 'ConflictError';
    }
}

/**
 * 410 Gone - Resource has been deleted
 */
export class GoneError extends ApiError {
    constructor(resource: string = 'Resource') {
        super(`${resource} has been deleted`, 410, 'GONE');
        this.name = 'GoneError';
    }
}

/**
 * 422 Unprocessable Entity - Request understood but cannot be processed
 */
export class UnprocessableError extends ApiError {
    constructor(message: string = 'Request cannot be processed', details?: unknown) {
        super(message, 422, 'UNPROCESSABLE_ENTITY', details);
        this.name = 'UnprocessableError';
    }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends ApiError {
    public readonly retryAfter?: number;

    constructor(message: string = 'Too many requests', retryAfter?: number) {
        super(message, 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}

/**
 * 500 Internal Server Error
 */
export class InternalError extends ApiError {
    constructor(message: string = 'Internal server error') {
        super(message, 500, 'INTERNAL_ERROR');
        this.name = 'InternalError';
    }
}

/**
 * 503 Service Unavailable
 */
export class ServiceUnavailableError extends ApiError {
    constructor(message: string = 'Service temporarily unavailable') {
        super(message, 503, 'SERVICE_UNAVAILABLE');
        this.name = 'ServiceUnavailableError';
    }
}
