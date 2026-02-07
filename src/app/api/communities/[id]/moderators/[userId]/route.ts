// src/app/api/communities/[id]/moderators/[userId]/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { getMembershipId } from '@/types/models';
import { arrayRemove, serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string; userId: string }>;
}

/**
 * DELETE /api/communities/[id]/moderators/[userId]
 * Remove a moderator from the community
 * Only owner can remove admins, admins can remove moderators
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id: communityId, userId: targetUserId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'remove_community_moderator',
            resource: { type: 'community', id: communityId, collection: 'communities' },
            handler: async ({ uid }) => {
                // Check if community exists
                const communityDoc = await db.collection('communities').doc(communityId).get();
                if (!communityDoc.exists || communityDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Community');
                }

                const communityData = communityDoc.data();

                // Owner cannot be removed
                if (communityData?.ownerId === targetUserId) {
                    return ApiResponse.forbidden('Cannot remove the owner');
                }

                // Check if requester has permission
                const requesterMembershipId = getMembershipId(communityId, uid);
                const requesterMembership = await db
                    .collection('memberships')
                    .doc(requesterMembershipId)
                    .get();

                if (!requesterMembership.exists) {
                    return ApiResponse.forbidden('You are not a member of this community');
                }

                const requesterRole = requesterMembership.data()?.role;
                if (!['owner', 'admin'].includes(requesterRole)) {
                    return ApiResponse.forbidden('Only owner or admins can remove moderators');
                }

                // Check target membership
                const targetMembershipId = getMembershipId(communityId, targetUserId);
                const targetMembershipRef = db.collection('memberships').doc(targetMembershipId);
                const targetMembership = await targetMembershipRef.get();

                if (!targetMembership.exists) {
                    return ApiResponse.notFound('Member');
                }

                const targetRole = targetMembership.data()?.role;

                // Only owner can remove admins
                if (targetRole === 'admin' && requesterRole !== 'owner') {
                    return ApiResponse.forbidden('Only owner can remove admins');
                }

                if (!['moderator', 'admin'].includes(targetRole)) {
                    return ApiResponse.badRequest('User is not a moderator');
                }

                const batch = db.batch();

                // Demote to member
                batch.update(targetMembershipRef, {
                    role: 'member',
                    updatedAt: serverTimestamp(),
                });

                // Remove from moderatorIds
                batch.update(db.collection('communities').doc(communityId), {
                    moderatorIds: arrayRemove(targetUserId),
                    updatedAt: serverTimestamp(),
                });

                await batch.commit();

                return ApiResponse.success({
                    message: 'Moderator removed successfully',
                    userId: targetUserId,
                });
            },
        },
        { id: communityId }
    );
}
