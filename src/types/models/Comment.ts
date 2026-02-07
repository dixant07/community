// src/types/models/Comment.ts

import { UserProfile } from './User';

/**
 * Comment status
 */
export type CommentStatus = 'published' | 'removed' | 'deleted';

/**
 * Comment metrics
 */
export interface CommentMetrics {
    upvotes: number;
    downvotes: number;
    score: number;
    replyCount: number;
}

/**
 * Comment on a post or another comment
 */
export interface Comment {
    id: string;
    postId: string;
    authorId: string;
    parentCommentId?: string; // For nested replies
    content: string;
    contentHtml?: string;
    status: CommentStatus;
    createdAt: string;
    updatedAt?: string;

    // Metrics
    metrics: CommentMetrics;

    // Hierarchy
    depth: number; // 0 for top-level, 1 for reply, etc.
    path: string[]; // Array of parent comment IDs for tree traversal

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
 * Comment with author for display
 */
export interface CommentWithAuthor extends Comment {
    author: UserProfile;
}

/**
 * Comment thread (nested structure)
 */
export interface CommentThread extends CommentWithAuthor {
    replies: CommentThread[];
}

/**
 * Default comment metrics
 */
export const DEFAULT_COMMENT_METRICS: CommentMetrics = {
    upvotes: 0,
    downvotes: 0,
    score: 0,
    replyCount: 0,
};

/**
 * Default values for new comments
 */
export const DEFAULT_COMMENT: Partial<Comment> = {
    status: 'published',
    depth: 0,
    path: [],
    isRemoved: false,
    metrics: DEFAULT_COMMENT_METRICS,
};
