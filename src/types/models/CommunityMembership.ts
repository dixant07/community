// src/types/models/CommunityMembership.ts

import { CommunityRole } from './Community';

/**
 * Community membership model
 * Tracks user membership in communities with role
 */
export interface CommunityMembership {
    id: string; // Composite: {communityId}_{userId}
    communityId: string;
    userId: string;
    role: CommunityRole;
    joinedAt: string;
    updatedAt?: string;

    // Member status in this community
    isBanned: boolean;
    bannedAt?: string;
    bannedReason?: string;
    bannedBy?: string;
    bannedUntil?: string; // For temporary bans

    isMuted: boolean;
    mutedAt?: string;
    mutedReason?: string;
    mutedBy?: string;
    mutedUntil?: string;

    // Permissions override (for approved submitters, etc.)
    canPost: boolean;
    canComment: boolean;

    // Stats
    postCount: number;
    commentCount: number;
}

/**
 * Get composite membership ID
 */
export function getMembershipId(communityId: string, userId: string): string {
    return `${communityId}_${userId}`;
}

/**
 * Default values for new memberships
 */
export const DEFAULT_MEMBERSHIP: Partial<CommunityMembership> = {
    role: 'member',
    isBanned: false,
    isMuted: false,
    canPost: true,
    canComment: true,
    postCount: 0,
    commentCount: 0,
};
