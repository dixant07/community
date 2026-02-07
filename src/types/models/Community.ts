// src/types/models/Community.ts

import { UserProfile } from './User';

/**
 * Community visibility
 */
export type CommunityVisibility = 'public' | 'restricted' | 'private';

/**
 * Community member role within the community
 */
export type CommunityRole = 'member' | 'moderator' | 'admin' | 'owner';

/**
 * Community rule
 */
export interface CommunityRule {
    id: string;
    title: string;
    description: string;
    order: number;
}

/**
 * Community model
 */
export interface Community {
    id: string;
    name: string;
    slug: string; // Unique URL-friendly name (like subreddit names)
    description?: string;
    ownerId: string;
    createdAt: string;
    updatedAt?: string;

    // Appearance
    bannerUrl?: string;
    iconUrl?: string;
    primaryColor?: string;

    // Settings
    visibility: CommunityVisibility;
    isNsfw: boolean;
    allowImages: boolean;
    allowVideos: boolean;
    allowLinks: boolean;
    requirePostApproval: boolean;
    restrictPosting: boolean; // Only approved users can post

    // Rules
    rules: CommunityRule[];

    // Stats
    memberCount: number;
    postCount: number;
    activeMembers?: number; // Members active in last 24h

    // Moderation team IDs (quick lookup)
    moderatorIds: string[];

    // Soft delete
    isDeleted?: boolean;
    deletedAt?: string;
    deletedBy?: string;

    // Ban status (banned by admins)
    isBanned?: boolean;
    bannedAt?: string;
    bannedReason?: string;
}

/**
 * Community summary for lists
 */
export interface CommunitySummary {
    id: string;
    name: string;
    slug: string;
    iconUrl?: string;
    memberCount: number;
    description?: string;
}

/**
 * Community with owner info for display
 */
export interface CommunityWithOwner extends Community {
    owner: UserProfile;
}

/**
 * Default values for new communities
 */
export const DEFAULT_COMMUNITY: Partial<Community> = {
    visibility: 'public',
    isNsfw: false,
    allowImages: true,
    allowVideos: true,
    allowLinks: true,
    requirePostApproval: false,
    restrictPosting: false,
    rules: [],
    memberCount: 1, // Owner is first member
    postCount: 0,
    moderatorIds: [],
};
