// src/types/models/Report.ts

/**
 * Report reason categories
 */
export type ReportReason =
    | 'spam'
    | 'harassment'
    | 'hate_speech'
    | 'violence'
    | 'misinformation'
    | 'copyright'
    | 'nsfw'
    | 'self_harm'
    | 'impersonation'
    | 'other';

/**
 * Report status
 */
export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';

/**
 * Report target type
 */
export type ReportTargetType = 'user' | 'post' | 'comment' | 'community';

/**
 * Report model
 */
export interface Report {
    id: string;
    reporterId: string;
    targetId: string;
    targetType: ReportTargetType;
    reason: ReportReason;
    description?: string;
    createdAt: string;
    updatedAt?: string;

    // Status tracking
    status: ReportStatus;

    // Resolution
    resolvedAt?: string;
    resolvedBy?: string;
    resolution?: string;
    actionTaken?: 'none' | 'warning' | 'content_removed' | 'user_banned' | 'user_suspended';

    // Community context (if report is in a community)
    communityId?: string;
}

/**
 * Default values for new reports
 */
export const DEFAULT_REPORT: Partial<Report> = {
    status: 'pending',
};
