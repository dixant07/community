// src/types/models/Bookmark.ts

/**
 * Bookmark model
 * Users can bookmark posts for later
 */
export interface Bookmark {
    id: string; // Composite: {userId}_{postId}
    userId: string;
    postId: string;
    createdAt: string;
}

/**
 * Get composite bookmark ID
 */
export function getBookmarkId(userId: string, postId: string): string {
    return `${userId}_${postId}`;
}
