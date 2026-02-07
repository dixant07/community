// src/app/api/communities/[id]/ban/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { banFromCommunitySchema } from '@/types/api';
import { getMembershipId, DEFAULT_MEMBERSHIP } from '@/types/models';
import { arrayRemove, decrement, serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/communities/[id]/ban
 * Ban a user from the community
 * Only moderators, admins, or owner can ban
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id: communityId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'ban_from_community',
            resource: { type: 'community', id: communityId, collection: 'communities' },
            bodySchema: banFromCommunitySchema,
            handler: async ({ uid, body }) => {
                const { userId: targetUserId, reason, durationDays } = body;

                // Check if community exists
                const communityDoc = await db.collection('communities').doc(communityId).get();
                if (!communityDoc.exists || communityDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Community');
                }

                const communityData = communityDoc.data();

                // Cannot ban owner
                if (communityData?.ownerId === targetUserId) {
                    return ApiResponse.forbidden('Cannot ban the community owner');
                }

                // Cannot ban self
                if (targetUserId === uid) {
                    return ApiResponse.badRequest('Cannot ban yourself');
                }

                // Check requester permission
                const requesterMembershipId = getMembershipId(communityId, uid);
                const requesterMembership = await db
                    .collection('memberships')
                    .doc(requesterMembershipId)
                    .get();

                if (!requesterMembership.exists) {
                    return ApiResponse.forbidden('You are not a member of this community');
                }

                const requesterRole = requesterMembership.data()?.role;
                if (!['owner', 'admin', 'moderator'].includes(requesterRole)) {
                    return ApiResponse.forbidden('Only moderators can ban users');
                }

                // Check target's role - cannot ban higher or equal role
                const targetMembershipId = getMembershipId(communityId, targetUserId);
                const targetMembershipRef = db.collection('memberships').doc(targetMembershipId);
                const targetMembership = await targetMembershipRef.get();

                const roleHierarchy: Record<string, number> = {
                    member: 0,
                    moderator: 1,
                    admin: 2,
                    owner: 3,
                };

                if (targetMembership.exists) {
                    const targetRole = targetMembership.data()?.role;
                    if (roleHierarchy[targetRole] >= roleHierarchy[requesterRole]) {
                        return ApiResponse.forbidden('Cannot ban someone with equal or higher role');
                    }
                }

                // Calculate ban end date if temporary
                let bannedUntil = null;
                if (durationDays) {
                    const endDate = new Date();
                    endDate.setDate(endDate.getDate() + durationDays);
                    bannedUntil = endDate.toISOString();
                }

                const now = new Date().toISOString();
                const batch = db.batch();

                if (targetMembership.exists) {
                    // Update existing membership to banned
                    batch.update(targetMembershipRef, {
                        isBanned: true,
                        bannedAt: now,
                        bannedReason: reason,
                        bannedBy: uid,
                        bannedUntil,
                        role: 'member', // Demote if moderator
                        updatedAt: serverTimestamp(),
                    });

                    // Remove from moderatorIds if was moderator
                    if (['moderator', 'admin'].includes(targetMembership.data()?.role)) {
                        batch.update(db.collection('communities').doc(communityId), {
                            moderatorIds: arrayRemove(targetUserId),
                        });
                    }
                } else {
                    // Create banned membership to prevent rejoining
                    batch.set(targetMembershipRef, {
                        ...DEFAULT_MEMBERSHIP,
                        id: targetMembershipId,
                        communityId,
                        userId: targetUserId,
                        role: 'member',
                        isBanned: true,
                        bannedAt: now,
                        bannedReason: reason,
                        bannedBy: uid,
                        bannedUntil,
                        joinedAt: now,
                    });
                }

                // Decrement member count if was active member
                if (targetMembership.exists && !targetMembership.data()?.isBanned) {
                    batch.update(db.collection('communities').doc(communityId), {
                        memberCount: decrement(1),
                        updatedAt: serverTimestamp(),
                    });
                }

                await batch.commit();

                // Send notification
                await db.collection('notifications').add({
                    userId: targetUserId,
                    type: 'ban',
                    actorId: uid,
                    targetId: communityId,
                    targetType: 'community',
                    title: 'You have been banned',
                    body: `You have been banned from ${communityData?.name}. Reason: ${reason}`,
                    isRead: false,
                    isArchived: false,
                    createdAt: now,
                });

                return ApiResponse.success({
                    message: 'User banned from community',
                    userId: targetUserId,
                    communityId,
                    bannedUntil,
                });
            },
        },
        { id: communityId }
    );
}

/**
 * DELETE /api/communities/[id]/ban
 * Unban a user from the community
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id: communityId } = await params;
    const db = getAdminDb();

    // Extract userId from query params
    const url = new URL(req.url);
    const targetUserId = url.searchParams.get('userId');

    if (!targetUserId) {
        return ApiResponse.badRequest('userId query parameter is required');
    }

    return withAuth(
        req,
        {
            action: 'unban_from_community',
            resource: { type: 'community', id: communityId, collection: 'communities' },
            handler: async ({ uid }) => {
                // Check if community exists
                const communityDoc = await db.collection('communities').doc(communityId).get();
                if (!communityDoc.exists || communityDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Community');
                }

                // Check requester permission
                const requesterMembershipId = getMembershipId(communityId, uid);
                const requesterMembership = await db
                    .collection('memberships')
                    .doc(requesterMembershipId)
                    .get();

                if (!requesterMembership.exists) {
                    return ApiResponse.forbidden('You are not a member of this community');
                }

                const requesterRole = requesterMembership.data()?.role;
                if (!['owner', 'admin', 'moderator'].includes(requesterRole)) {
                    return ApiResponse.forbidden('Only moderators can unban users');
                }

                // Check target membership
                const targetMembershipId = getMembershipId(communityId, targetUserId);
                const targetMembershipRef = db.collection('memberships').doc(targetMembershipId);
                const targetMembership = await targetMembershipRef.get();

                if (!targetMembership.exists || !targetMembership.data()?.isBanned) {
                    return ApiResponse.badRequest('User is not banned from this community');
                }

                // Unban - delete the membership record (they need to rejoin)
                await targetMembershipRef.delete();

                // Send notification
                await db.collection('notifications').add({
                    userId: targetUserId,
                    type: 'unban',
                    targetId: communityId,
                    targetType: 'community',
                    title: 'Ban lifted',
                    body: 'Your ban from the community has been lifted. You can now rejoin.',
                    isRead: false,
                    isArchived: false,
                    createdAt: new Date().toISOString(),
                });

                return ApiResponse.success({
                    message: 'User unbanned from community',
                    userId: targetUserId,
                    communityId,
                });
            },
        },
        { id: communityId }
    );
}
