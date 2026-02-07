// src/lib/opa/authorize.ts

import { getAdminAuth } from '@/lib/firebase/admin';
import { opaService, OpaDecision, OpaBatchItem, OpaBatchResult } from '@/services/opa';

/**
 * Authorization result
 */
export interface AuthResult {
    allow: boolean;
    decision: string | OpaDecision;
    uid: string | null;
    claims: Record<string, unknown>;
}

/**
 * Batch authorization request
 */
export interface BatchAuthRequest {
    action: string;
    resource: Record<string, unknown>;
    context?: Record<string, unknown>;
}

/**
 * Batch authorization result
 */
export interface BatchAuthResult extends AuthResult {
    index: number;
}

/**
 * Verify Firebase ID token and get user claims
 */
async function verifyToken(idToken: string): Promise<{
    uid: string;
    claims: Record<string, unknown>;
}> {
    try {
        const adminAuth = getAdminAuth();
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        return {
            uid: decodedToken.uid,
            claims: {
                email: decodedToken.email,
                emailVerified: decodedToken.email_verified,
                name: decodedToken.name,
                picture: decodedToken.picture,
                ...decodedToken,
            },
        };
    } catch (error) {
        console.error('Token verification failed:', error);
        throw new Error('Invalid ID token');
    }
}

/**
 * Get client IP from request headers
 */
export function getClientIp(headers: Headers): string | null {
    return (
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headers.get('x-real-ip') ||
        null
    );
}

/**
 * Authorize a single action
 * Verifies the token and checks OPA policy
 */
export async function authorize(
    idToken: string | null,
    action: string,
    resource: Record<string, unknown>,
    context?: Record<string, unknown>
): Promise<AuthResult> {
    // Handle no token case
    if (!idToken) {
        return {
            allow: false,
            decision: 'no-token',
            uid: null,
            claims: {},
        };
    }

    try {
        // Verify token
        const { uid, claims } = await verifyToken(idToken);

        // Query OPA for authorization
        const { allow, decision } = await opaService.isAllowed(
            uid,
            claims,
            action,
            resource,
            context?.ip as string | undefined
        );

        return {
            allow,
            decision,
            uid,
            claims,
        };
    } catch (error) {
        console.error('Authorization error:', error);
        return {
            allow: false,
            decision: error instanceof Error ? error.message : 'authorization-error',
            uid: null,
            claims: {},
        };
    }
}

/**
 * Authorize multiple actions in batch
 * More efficient when checking multiple permissions at once
 */
export async function authorizeBatch(
    idToken: string | null,
    requests: BatchAuthRequest[]
): Promise<BatchAuthResult[]> {
    // Handle no token case
    if (!idToken) {
        return requests.map((_, index) => ({
            allow: false,
            decision: 'no-token',
            uid: null,
            claims: {},
            index,
        }));
    }

    try {
        // Verify token once
        const { uid, claims } = await verifyToken(idToken);

        // Convert to OPA batch items
        const items: OpaBatchItem[] = requests.map((req) => ({
            action: req.action,
            resource: req.resource,
        }));

        // Execute batch query
        const opaResults: OpaBatchResult[] = await opaService.queryBatch(
            uid,
            claims,
            items,
            requests[0]?.context?.ip as string | undefined
        );

        // Map results
        return opaResults.map((result) => ({
            allow: result.allow,
            decision: result.decision,
            uid,
            claims,
            index: result.index,
        }));
    } catch (error) {
        console.error('Batch authorization error:', error);
        return requests.map((_, index) => ({
            allow: false,
            decision: error instanceof Error ? error.message : 'authorization-error',
            uid: null,
            claims: {},
            index,
        }));
    }
}

/**
 * Check if all batch requests are allowed
 */
export async function authorizeAll(
    idToken: string | null,
    requests: BatchAuthRequest[]
): Promise<{ allAllowed: boolean; results: BatchAuthResult[] }> {
    const results = await authorizeBatch(idToken, requests);
    const allAllowed = results.every((r) => r.allow);
    return { allAllowed, results };
}

/**
 * Check if any batch request is allowed
 */
export async function authorizeAny(
    idToken: string | null,
    requests: BatchAuthRequest[]
): Promise<{ anyAllowed: boolean; results: BatchAuthResult[] }> {
    const results = await authorizeBatch(idToken, requests);
    const anyAllowed = results.some((r) => r.allow);
    return { anyAllowed, results };
}

/**
 * Legacy function for backwards compatibility
 * @deprecated Use authorize() instead
 */
export async function verifyAndAuthorize(
    idToken: string | null,
    action: string,
    resource: Record<string, unknown>,
    context?: Record<string, unknown>
): Promise<AuthResult> {
    return authorize(idToken, action, resource, context);
}
