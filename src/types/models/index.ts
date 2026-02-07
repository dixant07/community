// src/types/models/index.ts

// User models
export type { User, UserProfile, UserSummary, UserRole } from './User';
export { DEFAULT_USER } from './User';

// Post models
export type { Post, PostWithAuthor, PostMetrics, PostStatus } from './Post';
export { DEFAULT_POST, DEFAULT_POST_METRICS } from './Post';

// Comment models
export type { Comment, CommentWithAuthor, CommentThread, CommentMetrics, CommentStatus } from './Comment';
export { DEFAULT_COMMENT, DEFAULT_COMMENT_METRICS } from './Comment';

// Community models
export type {
    Community,
    CommunitySummary,
    CommunityWithOwner,
    CommunityVisibility,
    CommunityRole,
    CommunityRule,
} from './Community';
export { DEFAULT_COMMUNITY } from './Community';

// Vote models
export type { Vote, VoteValue, VoteTargetType } from './Vote';
export { getVoteId } from './Vote';

// Membership models
export type { CommunityMembership } from './CommunityMembership';
export { getMembershipId, DEFAULT_MEMBERSHIP } from './CommunityMembership';

// Follow models
export type { UserFollow } from './UserFollow';
export { getFollowId } from './UserFollow';

// Notification models
export type { Notification, NotificationType } from './Notification';
export { DEFAULT_NOTIFICATION } from './Notification';

// Report models
export type { Report, ReportReason, ReportStatus, ReportTargetType } from './Report';
export { DEFAULT_REPORT } from './Report';

// Bookmark models
export type { Bookmark } from './Bookmark';
export { getBookmarkId } from './Bookmark';
