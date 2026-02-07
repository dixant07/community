// src/types/models/Notification.ts

/**
 * Notification types
 */
export type NotificationType =
    | 'follow'
    | 'comment'
    | 'reply'
    | 'mention'
    | 'upvote'
    | 'post_removed'
    | 'comment_removed'
    | 'community_invite'
    | 'moderator_invite'
    | 'ban'
    | 'unban'
    | 'system';

/**
 * Notification model
 */
export interface Notification {
    id: string;
    userId: string; // Recipient
    type: NotificationType;
    createdAt: string;
    readAt?: string;

    // Actor (who triggered the notification)
    actorId?: string;
    actorUsername?: string;
    actorPhotoURL?: string;

    // Target (what the notification is about)
    targetId?: string;
    targetType?: 'post' | 'comment' | 'community' | 'user';
    targetTitle?: string; // Preview text

    // Message content
    title: string;
    body?: string;
    link?: string; // URL to navigate to

    // Status
    isRead: boolean;
    isArchived: boolean;
}

/**
 * Default values for new notifications
 */
export const DEFAULT_NOTIFICATION: Partial<Notification> = {
    isRead: false,
    isArchived: false,
};
