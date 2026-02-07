// src/types/api/index.ts

import { z } from 'zod';

/**
 * Common API response types
 */
export interface ApiSuccessResponse<T> {
    success: true;
    data: T;
    meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
    success: false;
    error: string;
    code: string;
    details?: unknown;
}

export type ApiResponseType<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Pagination types
 */
export interface PaginationMeta {
    page: number;
    limit: number;
    total?: number;
    hasMore: boolean;
    nextCursor?: string;
}

export interface PaginatedResponse<T> {
    success: true;
    data: T[];
    pagination: PaginationMeta;
}

// ============================================
// User API Schemas
// ============================================

export const createUserSchema = z.object({
    email: z.string().email('Invalid email address'),
    username: z
        .string()
        .min(3, 'Username must be at least 3 characters')
        .max(30, 'Username must be at most 30 characters')
        .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    displayName: z.string().min(1, 'Display name is required').max(100).optional(),
    dateOfBirth: z.string().optional(),
    bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),
    photoURL: z.string().url('Invalid photo URL').optional(),
});

export type CreateUserRequest = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    bio: z.string().max(500).optional(),
    photoURL: z.string().url().optional(),
    dateOfBirth: z.string().optional(),
});

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;

export const banUserSchema = z.object({
    reason: z.string().min(1, 'Ban reason is required').max(500),
    permanent: z.boolean().optional().default(true),
});

export type BanUserRequest = z.infer<typeof banUserSchema>;

export const suspendUserSchema = z.object({
    reason: z.string().min(1, 'Suspension reason is required').max(500),
    durationDays: z.number().int().min(1).max(365),
});

export type SuspendUserRequest = z.infer<typeof suspendUserSchema>;

export const reportSchema = z.object({
    reason: z.enum([
        'spam',
        'harassment',
        'hate_speech',
        'violence',
        'misinformation',
        'copyright',
        'nsfw',
        'self_harm',
        'impersonation',
        'other',
    ]),
    description: z.string().max(1000).optional(),
});

export type ReportRequest = z.infer<typeof reportSchema>;

// ============================================
// Post API Schemas
// ============================================

export const createPostSchema = z.object({
    title: z.string().min(1, 'Title is required').max(300),
    content: z.string().min(1, 'Content is required').max(40000),
    communityId: z.string().optional(),
    tags: z.array(z.string()).max(10).optional(),
    mediaUrl: z.string().url().optional(),
    mediaType: z.enum(['image', 'video', 'link']).optional(),
    linkUrl: z.string().url().optional(),
    isNsfw: z.boolean().optional().default(false),
    isSpoiler: z.boolean().optional().default(false),
    flair: z.string().max(50).optional(),
});

export type CreatePostRequest = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
    title: z.string().min(1).max(300).optional(),
    content: z.string().min(1).max(40000).optional(),
    tags: z.array(z.string()).max(10).optional(),
    isNsfw: z.boolean().optional(),
    isSpoiler: z.boolean().optional(),
    flair: z.string().max(50).optional(),
});

export type UpdatePostRequest = z.infer<typeof updatePostSchema>;

export const voteSchema = z.object({
    value: z.union([z.literal(1), z.literal(-1)]),
});

export type VoteRequest = z.infer<typeof voteSchema>;

// ============================================
// Comment API Schemas
// ============================================

export const createCommentSchema = z.object({
    postId: z.string().min(1, 'Post ID is required'),
    content: z.string().min(1, 'Content is required').max(10000),
    parentCommentId: z.string().optional(),
});

export type CreateCommentRequest = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
    content: z.string().min(1).max(10000),
});

export type UpdateCommentRequest = z.infer<typeof updateCommentSchema>;

// ============================================
// Community API Schemas
// ============================================

export const createCommunitySchema = z.object({
    name: z.string().min(3, 'Name must be at least 3 characters').max(100),
    slug: z
        .string()
        .min(3)
        .max(21)
        .regex(
            /^[a-zA-Z0-9_]+$/,
            'Slug can only contain letters, numbers, and underscores'
        ),
    description: z.string().max(500).optional(),
    visibility: z.enum(['public', 'restricted', 'private']).optional().default('public'),
    isNsfw: z.boolean().optional().default(false),
    rules: z
        .array(
            z.object({
                title: z.string().max(100),
                description: z.string().max(500),
            })
        )
        .max(15)
        .optional(),
});

export type CreateCommunityRequest = z.infer<typeof createCommunitySchema>;

export const updateCommunitySchema = z.object({
    name: z.string().min(3).max(100).optional(),
    description: z.string().max(500).optional(),
    visibility: z.enum(['public', 'restricted', 'private']).optional(),
    isNsfw: z.boolean().optional(),
    bannerUrl: z.string().url().optional(),
    iconUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    allowImages: z.boolean().optional(),
    allowVideos: z.boolean().optional(),
    allowLinks: z.boolean().optional(),
    requirePostApproval: z.boolean().optional(),
    restrictPosting: z.boolean().optional(),
    rules: z
        .array(
            z.object({
                id: z.string().optional(),
                title: z.string().max(100),
                description: z.string().max(500),
                order: z.number().int().optional(),
            })
        )
        .max(15)
        .optional(),
});

export type UpdateCommunityRequest = z.infer<typeof updateCommunitySchema>;

export const banFromCommunitySchema = z.object({
    userId: z.string().min(1, 'User ID is required'),
    reason: z.string().min(1).max(500),
    durationDays: z.number().int().min(1).max(365).optional(), // Optional for permanent ban
});

export type BanFromCommunityRequest = z.infer<typeof banFromCommunitySchema>;

export const addModeratorSchema = z.object({
    userId: z.string().min(1, 'User ID is required'),
    role: z.enum(['moderator', 'admin']).optional().default('moderator'),
});

export type AddModeratorRequest = z.infer<typeof addModeratorSchema>;

// ============================================
// Query Schemas
// ============================================

export const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    cursor: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type ListQueryParams = z.infer<typeof listQuerySchema>;

export const searchQuerySchema = z.object({
    q: z.string().min(1).max(200),
    type: z.enum(['posts', 'users', 'communities', 'all']).optional().default('all'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export type SearchQueryParams = z.infer<typeof searchQuerySchema>;
