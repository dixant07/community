// src/types/models/Vote.ts

/**
 * Vote value
 */
export type VoteValue = 1 | -1;

/**
 * Vote target type
 */
export type VoteTargetType = 'post' | 'comment';

/**
 * Vote model - tracks upvotes and downvotes
 * Stored in subcollection: posts/{postId}/votes/{odId} or comments/{commentId}/votes/{odId}
 * Or in a flat collection: votes/{odId}
 */
export interface Vote {
    id: string;
    userId: string;
    targetId: string;
    targetType: VoteTargetType;
    value: VoteValue;
    createdAt: string;
    updatedAt?: string;
}

/**
 * Composite key for vote lookup
 * Used for quick existence checks
 */
export function getVoteId(userId: string, targetId: string, targetType: VoteTargetType): string {
    return `${userId}_${targetType}_${targetId}`;
}
