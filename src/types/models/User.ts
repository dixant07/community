// src/types/models/User.ts

/**
 * User roles in the system
 */
export type UserRole = 'user' | 'moderator' | 'admin' | 'super_admin';

/**
 * Core user model used across the application
 */
export interface User {
    id: string;
    email: string;
    username: string;
    displayName?: string;
    photoURL?: string;
    bio?: string;
    dateOfBirth?: string;
    createdAt: string;
    updatedAt?: string;
    provider?: 'email' | 'google' | 'github';
    hasCompletedOnboarding: boolean;

    // Role and permissions
    role: UserRole;

    // Moderation fields
    isBanned: boolean;
    bannedAt?: string;
    bannedReason?: string;
    bannedBy?: string;

    isSuspended: boolean;
    suspendedUntil?: string;
    suspendedReason?: string;
    suspendedBy?: string;

    // Stats
    postCount: number;
    commentCount: number;
    followerCount: number;
    followingCount: number;
    karma: number;

    // Soft delete
    isDeleted?: boolean;
    deletedAt?: string;
}

/**
 * User profile for embedding in posts/comments
 */
export interface UserProfile {
    id: string;
    username: string;
    displayName?: string;
    photoURL?: string;
    role: UserRole;
}

/**
 * User summary for lists and references
 */
export interface UserSummary {
    id: string;
    username: string;
    displayName?: string;
    photoURL?: string;
    role: UserRole;
    followerCount: number;
}

/**
 * Default values for new users
 */
export const DEFAULT_USER: Partial<User> = {
    role: 'user',
    isBanned: false,
    isSuspended: false,
    hasCompletedOnboarding: false,
    postCount: 0,
    commentCount: 0,
    followerCount: 0,
    followingCount: 0,
    karma: 0,
};
