// src/app/api/communities/[id]/moderators/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { addModeratorSchema } from '@/types/api';
import { getMembershipId } from '@/types/models';
import { arrayUnion, serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/communities/[id]/moderators
 * Add a moderator to the community
 * Only owner or existing admins can add moderators
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id: communityId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'add_community_moderator',
            resource: { type: 'community', id: communityId, collection: 'communities' },
            bodySchema: addModeratorSchema,
            handler: async ({ uid, body }) => {
                const { userId, role } = body;

                // Check if community exists
                const communityDoc = await db.collection('communities').doc(communityId).get();
                if (!communityDoc.exists || communityDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Community');
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
                    return ApiResponse.forbidden('Only owner or admins can add moderators');
                }

                // Cannot promote to admin if not owner
                if (role === 'admin' && requesterRole !== 'owner') {
                    return ApiResponse.forbidden('Only owner can add admins');
                }

                // Check if target user exists
                const targetUserDoc = await db.collection('users').doc(userId).get();
                if (!targetUserDoc.exists || targetUserDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('User');
                }

                // Check target membership
                const targetMembershipId = getMembershipId(communityId, userId);
                const targetMembershipRef = db.collection('memberships').doc(targetMembershipId);
                const targetMembership = await targetMembershipRef.get();

                if (!targetMembership.exists) {
                    return ApiResponse.badRequest('User must be a member of the community first');
                }

                const targetData = targetMembership.data();
                if (targetData?.isBanned) {
                    return ApiResponse.badRequest('Cannot promote a banned user');
                }

                if (['owner', 'admin', 'moderator'].includes(targetData?.role)) {
                    return ApiResponse.conflict('User is already a moderator or higher');
                }

                const batch = db.batch();

                // Update membership role
                batch.update(targetMembershipRef, {
                    role: role || 'moderator',
                    updatedAt: serverTimestamp(),
                });

                // Add to community moderatorIds
                batch.update(db.collection('communities').doc(communityId), {
                    moderatorIds: arrayUnion(userId),
                    updatedAt: serverTimestamp(),
                });

                await batch.commit();

                // Send notification
                await db.collection('notifications').add({
                    userId,
                    type: 'moderator_invite',
                    actorId: uid,
                    targetId: communityId,
                    targetType: 'community',
                    title: 'You are now a moderator',
                    body: `You have been made a ${role || 'moderator'} of this community`,
                    link: `/community/${communityId}`,
                    isRead: false,
                    isArchived: false,
                    createdAt: new Date().toISOString(),
                });

                return ApiResponse.success({
                    message: 'Moderator added successfully',
                    userId,
                    role: role || 'moderator',
                });
            },
        },
        { id: communityId }
    );
}
