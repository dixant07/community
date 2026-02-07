// src/types/models/UserFollow.ts

/**
 * User follow relationship
 * Stored in flat collection: follows/{id}
 */
export interface UserFollow {
    id: string; // Composite: {followerId}_{followingId}
    followerId: string; // User who is following
    followingId: string; // User being followed
    createdAt: string;
}

/**
 * Get composite follow ID
 */
export function getFollowId(followerId: string, followingId: string): string {
    return `${followerId}_${followingId}`;
}
