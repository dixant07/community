// src/lib/api/response.ts

import { NextResponse } from 'next/server';
import { ApiError } from './errors';

/**
 * Pagination metadata
 */
export interface PaginationMeta {
    page: number;
    limit: number;
    total?: number;
    hasMore: boolean;
    nextCursor?: string;
    prevCursor?: string;
    meta?: Record<string, unknown>;
}


/**
 * Standard API response structure
 */
export interface ApiSuccessResponse<T> {
    success: true;
    data: T;
    meta?: Record<string, unknown>;
}

export interface ApiErrorResponseType {
    success: false;
    error: string;
    code: string;
    details?: unknown;
}

export interface ApiPaginatedResponse<T> {
    success: true;
    data: T[];
    pagination: PaginationMeta;
}

/**
 * API Response helper class
 */
export class ApiResponse {
    /**
     * Success response with data
     */
    static success<T>(data: T, status: number = 200): NextResponse {
        return NextResponse.json(
            {
                success: true,
                data,
            } satisfies ApiSuccessResponse<T>,
            { status }
        );
    }

    /**
     * Created response (201)
     */
    static created<T>(data: T): NextResponse {
        return ApiResponse.success(data, 201);
    }

    /**
     * No content response (204)
     */
    static noContent(): NextResponse {
        return new NextResponse(null, { status: 204 });
    }

    /**
     * Paginated response
     */
    static paginated<T>(
        data: T[],
        pagination: PaginationMeta,
        status: number = 200
    ): NextResponse {
        return NextResponse.json(
            {
                success: true,
                data,
                pagination,
            } satisfies ApiPaginatedResponse<T>,
            { status }
        );
    }

    /**
     * Error response
     */
    static error(
        message: string,
        status: number = 500,
        code: string = 'ERROR',
        details?: unknown
    ): NextResponse {
        return NextResponse.json(
            {
                success: false,
                error: message,
                code,
                details,
            } satisfies ApiErrorResponseType,
            { status }
        );
    }

    /**
     * Create error response from ApiError
     */
    static fromError(error: ApiError): NextResponse {
        return ApiResponse.error(
            error.message,
            error.statusCode,
            error.code,
            error.details
        );
    }

    /**
     * Bad request (400)
     */
    static badRequest(message: string = 'Bad request', details?: unknown): NextResponse {
        return ApiResponse.error(message, 400, 'BAD_REQUEST', details);
    }

    /**
     * Unauthorized (401)
     */
    static unauthorized(message: string = 'Authentication required'): NextResponse {
        return ApiResponse.error(message, 401, 'UNAUTHORIZED');
    }

    /**
     * Forbidden (403)
     */
    static forbidden(message: string = 'Access denied', details?: unknown): NextResponse {
        return ApiResponse.error(message, 403, 'FORBIDDEN', details);
    }

    /**
     * Not found (404)
     */
    static notFound(resource: string = 'Resource'): NextResponse {
        return ApiResponse.error(`${resource} not found`, 404, 'NOT_FOUND');
    }

    /**
     * Conflict (409)
     */
    static conflict(message: string = 'Resource already exists'): NextResponse {
        return ApiResponse.error(message, 409, 'CONFLICT');
    }

    /**
     * Unprocessable entity (422)
     */
    static unprocessable(message: string, details?: unknown): NextResponse {
        return ApiResponse.error(message, 422, 'UNPROCESSABLE_ENTITY', details);
    }

    /**
     * Rate limit exceeded (429)
     */
    static rateLimited(retryAfter?: number): NextResponse {
        const response = ApiResponse.error('Too many requests', 429, 'RATE_LIMITED', { retryAfter });
        if (retryAfter) {
            response.headers.set('Retry-After', String(retryAfter));
        }
        return response;
    }

    /**
     * Internal server error (500)
     */
    static internalError(message: string = 'Internal server error'): NextResponse {
        return ApiResponse.error(message, 500, 'INTERNAL_ERROR');
    }
}
