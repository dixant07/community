// src/types/models/Post.ts

import { UserProfile } from './User';

/**
 * Post status
 */
export type PostStatus = 'published' | 'draft' | 'removed' | 'deleted';

/**
 * Post metrics for engagement tracking
 */
export interface PostMetrics {
    upvotes: number;
    downvotes: number;
    score: number; // upvotes - downvotes
    commentCount: number;
    viewCount: number;
    bookmarkCount: number;
    shareCount: number;
}

/**
 * Core post model stored in Firestore
 */
export interface Post {
    id: string;
    title: string;
    content: string;
    contentHtml?: string; // Rendered markdown
    authorId: string;
    communityId?: string;
    communitySlug?: string;
    status: PostStatus;
    createdAt: string;
    updatedAt?: string;
    publishedAt?: string;

    // Media
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'link';
    thumbnailUrl?: string;
    linkUrl?: string;
    linkTitle?: string;
    linkDescription?: string;

    // Categorization
    tags: string[];
    flair?: string;
    isNsfw: boolean;
    isSpoiler: boolean;
    isPinned: boolean;
    isLocked: boolean;

    // Metrics
    metrics: PostMetrics;

    // Moderation
    isRemoved: boolean;
    removedAt?: string;
    removedBy?: string;
    removedReason?: string;

    // Soft delete
    isDeleted?: boolean;
    deletedAt?: string;
}

/**
 * Post with author information for display
 */
export interface PostWithAuthor extends Post {
    author: UserProfile;
}

/**
 * Default post metrics
 */
export const DEFAULT_POST_METRICS: PostMetrics = {
    upvotes: 0,
    downvotes: 0,
    score: 0,
    commentCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
};

/**
 * Default values for new posts
 */
export const DEFAULT_POST: Partial<Post> = {
    status: 'published',
    tags: [],
    isNsfw: false,
    isSpoiler: false,
    isPinned: false,
    isLocked: false,
    isRemoved: false,
    metrics: DEFAULT_POST_METRICS,
};
