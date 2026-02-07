// src/services/opa/OpaService.ts

const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';

/**
 * OPA authorization input structure
 */
export interface OpaInput {
    uid: string;
    tokenClaims: Record<string, unknown>;
    action: string;
    resource: Record<string, unknown>;
    env: {
        now: string;
        ip: string | null;
    };
}

/**
 * OPA decision response
 */
export interface OpaDecision {
    allow: boolean;
    reason?: string;
    [key: string]: unknown;
}

/**
 * Batch OPA request item
 */
export interface OpaBatchItem {
    action: string;
    resource: Record<string, unknown>;
}

/**
 * Batch OPA result
 */
export interface OpaBatchResult {
    index: number;
    allow: boolean;
    decision: OpaDecision;
}

/**
 * Service for interacting with Open Policy Agent
 * Supports both single and batch authorization queries
 */
export class OpaService {
    private baseUrl: string;
    private cache: Map<string, { decision: OpaDecision; expiry: number }>;
    private cacheEnabled: boolean;
    private cacheTtlMs: number;

    constructor(
        baseUrl = OPA_URL,
        options: { cacheEnabled?: boolean; cacheTtlMs?: number } = {}
    ) {
        this.baseUrl = baseUrl;
        this.cache = new Map();
        this.cacheEnabled = options.cacheEnabled ?? true;
        this.cacheTtlMs = options.cacheTtlMs ?? 30000; // 30 seconds default
    }

    /**
     * Generate cache key for an authorization request
     */
    private getCacheKey(input: OpaInput): string {
        return JSON.stringify({
            uid: input.uid,
            action: input.action,
            resource: input.resource,
        });
    }

    /**
     * Get cached decision if available and not expired
     */
    private getCachedDecision(key: string): OpaDecision | null {
        if (!this.cacheEnabled) return null;

        const cached = this.cache.get(key);
        if (cached && cached.expiry > Date.now()) {
            return cached.decision;
        }

        // Remove expired entry
        if (cached) {
            this.cache.delete(key);
        }
        return null;
    }

    /**
     * Cache a decision
     */
    private cacheDecision(key: string, decision: OpaDecision): void {
        if (!this.cacheEnabled) return;

        this.cache.set(key, {
            decision,
            expiry: Date.now() + this.cacheTtlMs,
        });
    }

    /**
     * Clear the cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Query OPA for a single authorization decision
     */
    async query(input: OpaInput): Promise<OpaDecision> {
        const cacheKey = this.getCacheKey(input);
        const cached = this.getCachedDecision(cacheKey);
        if (cached) {
            return cached;
        }

        const url = `${this.baseUrl}/v1/data/authz/decision`;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`OPA call failed ${res.status}: ${text}`);
        }

        const json = await res.json();
        const decision = json.result || { allow: false, reason: 'no decision returned' };

        this.cacheDecision(cacheKey, decision);
        return decision;
    }

    /**
     * Batch query OPA for multiple authorization decisions
     * More efficient when checking multiple permissions at once
     */
    async queryBatch(
        uid: string,
        tokenClaims: Record<string, unknown>,
        items: OpaBatchItem[],
        ip?: string
    ): Promise<OpaBatchResult[]> {
        const now = new Date().toISOString();
        const results: OpaBatchResult[] = [];
        const uncachedItems: { index: number; input: OpaInput }[] = [];

        // Check cache first
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const input: OpaInput = {
                uid,
                tokenClaims,
                action: item.action,
                resource: item.resource,
                env: { now, ip: ip ?? null },
            };

            const cacheKey = this.getCacheKey(input);
            const cached = this.getCachedDecision(cacheKey);

            if (cached) {
                results.push({
                    index: i,
                    allow: cached.allow,
                    decision: cached,
                });
            } else {
                uncachedItems.push({ index: i, input });
            }
        }

        // If all cached, return immediately
        if (uncachedItems.length === 0) {
            return results.sort((a, b) => a.index - b.index);
        }

        // Query OPA for uncached items in parallel
        const opaResults = await Promise.all(
            uncachedItems.map(async ({ index, input }) => {
                try {
                    const decision = await this.query(input);
                    return {
                        index,
                        allow: decision.allow,
                        decision,
                    };
                } catch (error) {
                    return {
                        index,
                        allow: false,
                        decision: {
                            allow: false,
                            reason: error instanceof Error ? error.message : 'OPA query failed',
                        },
                    };
                }
            })
        );

        // Combine cached and fresh results
        results.push(...opaResults);
        return results.sort((a, b) => a.index - b.index);
    }

    /**
     * Check if a user is allowed to perform an action
     */
    async isAllowed(
        uid: string,
        tokenClaims: Record<string, unknown>,
        action: string,
        resource: Record<string, unknown>,
        ip?: string
    ): Promise<{ allow: boolean; decision: OpaDecision }> {
        const input: OpaInput = {
            uid,
            tokenClaims,
            action,
            resource,
            env: {
                now: new Date().toISOString(),
                ip: ip ?? null,
            },
        };

        const decision = await this.query(input);
        const allow = !!(decision && decision.allow === true);

        return { allow, decision };
    }

    /**
     * Check multiple permissions at once
     * Returns true only if ALL permissions are allowed
     */
    async isAllAllowed(
        uid: string,
        tokenClaims: Record<string, unknown>,
        items: OpaBatchItem[],
        ip?: string
    ): Promise<{ allAllowed: boolean; results: OpaBatchResult[] }> {
        const results = await this.queryBatch(uid, tokenClaims, items, ip);
        const allAllowed = results.every((r) => r.allow);
        return { allAllowed, results };
    }

    /**
     * Check multiple permissions at once
     * Returns true if ANY permission is allowed
     */
    async isAnyAllowed(
        uid: string,
        tokenClaims: Record<string, unknown>,
        items: OpaBatchItem[],
        ip?: string
    ): Promise<{ anyAllowed: boolean; results: OpaBatchResult[] }> {
        const results = await this.queryBatch(uid, tokenClaims, items, ip);
        const anyAllowed = results.some((r) => r.allow);
        return { anyAllowed, results };
    }
}

/**
 * Singleton OPA service instance
 */
export const opaService = new OpaService();

/**
 * Legacy function for backwards compatibility
 */
export async function opaQuery(input: OpaInput): Promise<OpaDecision> {
    return opaService.query(input);
}
