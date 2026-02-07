// opa/authz.rego
// OPA Authorization Policies for Community App

package authz

import future.keywords.in
import future.keywords.if

# Default deny
default allow = false

# ============================================
# Helper Functions
# ============================================

# Check if user is authenticated
is_authenticated {
    input.user.uid != ""
}

# Check if user is admin
is_admin {
    input.user.claims.role == "admin"
}

is_admin {
    input.user.claims.role == "super_admin"
}

# Check if user is the resource owner
is_owner {
    input.resource.data.ownerId == input.user.uid
}

is_owner {
    input.resource.data.authorId == input.user.uid
}

# Check if user is banned
is_banned {
    input.user.claims.isBanned == true
}

# Check if user is suspended
is_suspended {
    input.user.claims.isSuspended == true
}

# Check if action is blocked due to moderation
action_blocked {
    is_banned
}

action_blocked {
    is_suspended
}

# ============================================
# User Policies
# ============================================

# List users - any authenticated user can list
allow {
    input.action == "list_users"
    is_authenticated
    not action_blocked
}

# Create user - for new user signup
allow {
    input.action == "create_user"
    is_authenticated
}

# Read user - any authenticated user can read
allow {
    input.action == "read_user"
    is_authenticated
}

# Update user - only self or admin
allow {
    input.action == "update_user"
    is_authenticated
    not action_blocked
    input.resource.id == input.user.uid
}

allow {
    input.action == "update_user"
    is_admin
}

# Delete user - only admin or self
allow {
    input.action == "delete_user"
    is_authenticated
    input.resource.id == input.user.uid
}

allow {
    input.action == "delete_user"
    is_admin
}

# Ban user - only admin
allow {
    input.action == "ban_user"
    is_admin
}

# Unban user - only admin
allow {
    input.action == "unban_user"
    is_admin
}

# Suspend user - only admin or moderator
allow {
    input.action == "suspend_user"
    is_admin
}

allow {
    input.action == "suspend_user"
    input.user.claims.role == "moderator"
}

# Unsuspend user - only admin
allow {
    input.action == "unsuspend_user"
    is_admin
}

# Follow user - any authenticated user (not self)
allow {
    input.action == "follow_user"
    is_authenticated
    not action_blocked
    input.resource.id != input.user.uid
}

# Unfollow user - any authenticated user
allow {
    input.action == "unfollow_user"
    is_authenticated
}

# Report user - any authenticated user (not self)
allow {
    input.action == "report_user"
    is_authenticated
    not action_blocked
    input.resource.id != input.user.uid
}

# List followers/following - any authenticated user
allow {
    input.action == "list_followers"
    is_authenticated
}

allow {
    input.action == "list_following"
    is_authenticated
}

# ============================================
# Post Policies
# ============================================

# List posts - any authenticated user
allow {
    input.action == "list_posts"
    is_authenticated
}

# Create post - any authenticated, non-blocked user
allow {
    input.action == "create_post"
    is_authenticated
    not action_blocked
}

# Read post - any authenticated user
allow {
    input.action == "read_post"
    is_authenticated
}

# Update post - only author or admin
allow {
    input.action == "update_post"
    is_authenticated
    not action_blocked
    is_owner
}

allow {
    input.action == "update_post"
    is_admin
}

# Delete post - only author or admin
allow {
    input.action == "delete_post"
    is_authenticated
    is_owner
}

allow {
    input.action == "delete_post"
    is_admin
}

# Vote on post - any authenticated, non-blocked user
allow {
    input.action == "vote_post"
    is_authenticated
    not action_blocked
}

# Remove vote - any authenticated user
allow {
    input.action == "unvote_post"
    is_authenticated
}

# Bookmark post - any authenticated user
allow {
    input.action == "bookmark_post"
    is_authenticated
}

allow {
    input.action == "unbookmark_post"
    is_authenticated
}

# Report post - any authenticated, non-blocked user
allow {
    input.action == "report_post"
    is_authenticated
    not action_blocked
}

# ============================================
# Comment Policies
# ============================================

# List comments - any authenticated user
allow {
    input.action == "list_comments"
    is_authenticated
}

# Create comment - any authenticated, non-blocked user
allow {
    input.action == "create_comment"
    is_authenticated
    not action_blocked
}

# Read comment - any authenticated user
allow {
    input.action == "read_comment"
    is_authenticated
}

# Update comment - only author
allow {
    input.action == "update_comment"
    is_authenticated
    not action_blocked
    is_owner
}

# Delete comment - author or admin
allow {
    input.action == "delete_comment"
    is_authenticated
    is_owner
}

allow {
    input.action == "delete_comment"
    is_admin
}

# Vote on comment
allow {
    input.action == "vote_comment"
    is_authenticated
    not action_blocked
}

allow {
    input.action == "unvote_comment"
    is_authenticated
}

# Report comment
allow {
    input.action == "report_comment"
    is_authenticated
    not action_blocked
}

# ============================================
# Community Policies
# ============================================

# List communities - any authenticated user
allow {
    input.action == "list_communities"
    is_authenticated
}

# Create community - any authenticated, non-blocked user
allow {
    input.action == "create_community"
    is_authenticated
    not action_blocked
}

# Read community - any authenticated user
allow {
    input.action == "read_community"
    is_authenticated
}

# Update community - owner/admin of community or platform admin
allow {
    input.action == "update_community"
    is_authenticated
    not action_blocked
    is_owner
}

allow {
    input.action == "update_community"
    is_admin
}

# Delete community - only owner or platform admin
allow {
    input.action == "delete_community"
    is_authenticated
    is_owner
}

allow {
    input.action == "delete_community"
    is_admin
}

# Join community - any authenticated, non-blocked user
allow {
    input.action == "join_community"
    is_authenticated
    not action_blocked
}

# Leave community - any authenticated user
allow {
    input.action == "leave_community"
    is_authenticated
}

# List community members - any authenticated user
allow {
    input.action == "list_community_members"
    is_authenticated
}

# Add moderator - admin level check done in API handler
allow {
    input.action == "add_community_moderator"
    is_authenticated
    not action_blocked
}

# Remove moderator - admin level check done in API handler
allow {
    input.action == "remove_community_moderator"
    is_authenticated
    not action_blocked
}

# Ban from community - moderator level check done in API handler
allow {
    input.action == "ban_from_community"
    is_authenticated
    not action_blocked
}

# Unban from community
allow {
    input.action == "unban_from_community"
    is_authenticated
    not action_blocked
}

# Report community
allow {
    input.action == "report_community"
    is_authenticated
    not action_blocked
}

# ============================================
# Additional Read Policies
# ============================================

# Feed - any authenticated user
allow {
    input.action == "read_feed"
    is_authenticated
}

# Notifications - only self
allow {
    input.action == "read_notifications"
    is_authenticated
    input.resource.userId == input.user.uid
}

# Search - any authenticated user
allow {
    input.action == "search"
    is_authenticated
}

# Trending - any authenticated user
allow {
    input.action == "read_trending"
    is_authenticated
}

# ============================================
# Admin Policies
# ============================================

# Admin: view reports
allow {
    input.action == "list_reports"
    is_admin
}

# Admin: resolve report
allow {
    input.action == "resolve_report"
    is_admin
}

# Admin: any moderation action
allow {
    input.action == "admin_action"
    is_admin
}
