// src/lib/api/base.ts

import { NextRequest } from 'next/server';
import { z, ZodSchema } from 'zod';
import { authorize, AuthResult, getClientIp } from '@/lib/opa/authorize';
import { ApiResponse } from './response';
import {
    ApiError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
} from './errors';

/**
 * Authenticated handler context
 */
export interface AuthContext {
    uid: string;
    claims: Record<string, unknown>;
    idToken: string;
}

/**
 * Handler context with parsed body
 */
export interface HandlerContext<T = unknown> extends AuthContext {
    body: T;
    params: Record<string, string>;
    query: URLSearchParams;
    request: NextRequest;
    ip: string | null;
}

/**
 * Handler options
 */
export interface HandlerOptions<TBody = unknown> {
    /** Action for OPA authorization */
    action: string;
    /** Resource for OPA authorization (can be a sync or async function for dynamic resources) */
    resource:
    | Record<string, unknown>
    | ((ctx: {
        params: Record<string, string>;
        query: URLSearchParams;
        body?: TBody;
    }) => Record<string, unknown> | Promise<Record<string, unknown>>);
    /** Optional additional context for OPA authorization */
    context?: Record<string, unknown>;
    /** Zod schema for body validation */
    bodySchema?: ZodSchema<TBody>;
    /** Whether authentication is required (default: true) */
    requireAuth?: boolean;
    /** The handler function */
    handler: (ctx: HandlerContext<TBody>) => Promise<Response>;
}


/**
 * Extract Bearer token from Authorization header
 */
export function extractToken(req: NextRequest): string | null {
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/);
    return match ? match[1] : null;
}

/**
 * Extract route parameters from URL
 */
export function extractParams(req: NextRequest): Record<string, string> {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    const params: Record<string, string> = {};

    // Look for ID patterns in the path
    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        // If previous part is a collection name and current looks like an ID
        if (i > 0 && !['api', 'v1'].includes(pathParts[i - 1])) {
            const knownActions = [
                'ban',
                'suspend',
                'report',
                'like',
                'bookmark',
                'join',
                'vote',
                'follow',
                'moderators',
                'members',
            ];
            if (!knownActions.includes(part) && pathParts[i - 1] !== 'api') {
                const collections = ['users', 'posts', 'comments', 'communities'];
                if (collections.includes(pathParts[i - 1])) {
                    params.id = part;
                }
            }
        }
    }

    return params;
}

/**
 * Parse and validate request body
 */
async function parseBody<T>(req: NextRequest, schema?: ZodSchema<T>): Promise<T | undefined> {
    const contentType = req.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
        return undefined;
    }

    try {
        const body = await req.json();

        if (schema) {
            const result = schema.safeParse(body);
            if (!result.success) {
                throw new ValidationError('Validation failed', result.error.flatten());
            }
            return result.data;
        }

        return body as T;
    } catch (error) {
        if (error instanceof ValidationError) throw error;
        if (error instanceof SyntaxError) {
            throw new ValidationError('Invalid JSON in request body');
        }
        throw error;
    }
}

/**
 * Create an authenticated API handler with OPA authorization
 */
export function withAuth<TBody = unknown>(
    req: NextRequest,
    options: HandlerOptions<TBody>,
    routeParams?: Record<string, string>
): Promise<Response> {
    return handleRequest(req, options, routeParams);
}

/**
 * Main request handler
 */
async function handleRequest<TBody>(
    req: NextRequest,
    options: HandlerOptions<TBody>,
    routeParams?: Record<string, string>
): Promise<Response> {
    try {
        const {
            action,
            resource,
            context,
            bodySchema,
            requireAuth = true,
            handler,
        } = options;

        // Extract token and client IP
        const idToken = extractToken(req);
        const ip = getClientIp(req.headers);

        if (requireAuth && !idToken) {
            throw new AuthenticationError('Missing Authorization Bearer token');
        }

        // Parse body if schema provided or if POST/PATCH/PUT
        let body: TBody | undefined;
        if (['POST', 'PATCH', 'PUT'].includes(req.method || '')) {
            body = await parseBody(req, bodySchema);
        }

        // Extract params and query
        const params = routeParams || extractParams(req);
        const query = new URL(req.url).searchParams;

        // Build resource object (may be async)
        let resourceObj: Record<string, unknown>;
        if (typeof resource === 'function') {
            const result = resource({ params, query, body });
            resourceObj = result instanceof Promise ? await result : result;
        } else {
            resourceObj = resource;
        }


        // Authorize with OPA
        let authResult: AuthResult;

        if (requireAuth && idToken) {
            authResult = await authorize(idToken, action, resourceObj, {
                ...context,
                ip,
            });

            if (!authResult.allow) {
                throw new AuthorizationError('Access denied', authResult.decision);
            }
        } else {
            // For non-authenticated requests
            authResult = {
                allow: true,
                decision: 'no-auth-required',
                uid: null,
                claims: {},
            };
        }

        // Build handler context
        const ctx: HandlerContext<TBody> = {
            uid: authResult.uid || '',
            claims: authResult.claims,
            idToken: idToken || '',
            body: body as TBody,
            params,
            query,
            request: req,
            ip,
        };

        // Execute handler
        return await handler(ctx);
    } catch (error) {
        return handleError(error);
    }
}

/**
 * Handle errors and return appropriate responses
 */
function handleError(error: unknown): Response {
    if (error instanceof ApiError) {
        return ApiResponse.fromError(error);
    }

    console.error('Unhandled error:', error);
    return ApiResponse.error(
        error instanceof Error ? error.message : 'Internal server error',
        500
    );
}

/**
 * Create a handler that doesn't require authentication
 */
export function withoutAuth<TBody = unknown>(
    req: NextRequest,
    options: Omit<HandlerOptions<TBody>, 'requireAuth'>,
    routeParams?: Record<string, string>
): Promise<Response> {
    return handleRequest(req, { ...options, requireAuth: false }, routeParams);
}

/**
 * Pagination parameters schema
 */
export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Parse pagination from query params
 */
export function parsePagination(query: URLSearchParams): PaginationParams {
    return paginationSchema.parse({
        page: query.get('page') || undefined,
        limit: query.get('limit') || undefined,
        cursor: query.get('cursor') || undefined,
        sortBy: query.get('sortBy') || undefined,
        sortOrder: query.get('sortOrder') || undefined,
    });
}
