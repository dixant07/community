// src/app/api/communities/[id]/join/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { getMembershipId, DEFAULT_MEMBERSHIP } from '@/types/models';
import { increment, decrement, serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/communities/[id]/join
 * Join a community
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id: communityId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'join_community',
            resource: { type: 'community', id: communityId, collection: 'communities' },
            handler: async ({ uid }) => {
                // Check if community exists
                const communityDoc = await db.collection('communities').doc(communityId).get();
                if (!communityDoc.exists || communityDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Community');
                }

                const communityData = communityDoc.data();

                // Check visibility
                if (communityData?.visibility === 'private') {
                    return ApiResponse.forbidden('This is a private community');
                }

                // Check if already a member
                const membershipId = getMembershipId(communityId, uid);
                const membershipRef = db.collection('memberships').doc(membershipId);
                const existingMembership = await membershipRef.get();

                if (existingMembership.exists) {
                    const memberData = existingMembership.data();
                    if (memberData?.isBanned) {
                        return ApiResponse.forbidden('You are banned from this community');
                    }
                    return ApiResponse.conflict('Already a member of this community');
                }

                const now = new Date().toISOString();
                const batch = db.batch();

                // Create membership
                batch.set(membershipRef, {
                    ...DEFAULT_MEMBERSHIP,
                    id: membershipId,
                    communityId,
                    userId: uid,
                    role: 'member',
                    joinedAt: now,
                });

                // Increment community member count
                batch.update(db.collection('communities').doc(communityId), {
                    memberCount: increment(1),
                    updatedAt: serverTimestamp(),
                });

                await batch.commit();

                return ApiResponse.success({
                    message: 'Joined community successfully',
                    communityId,
                    role: 'member',
                });
            },
        },
        { id: communityId }
    );
}

/**
 * DELETE /api/communities/[id]/join
 * Leave a community
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id: communityId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'leave_community',
            resource: { type: 'community', id: communityId, collection: 'communities' },
            handler: async ({ uid }) => {
                // Check if community exists
                const communityDoc = await db.collection('communities').doc(communityId).get();
                if (!communityDoc.exists || communityDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Community');
                }

                const communityData = communityDoc.data();

                // Owner cannot leave
                if (communityData?.ownerId === uid) {
                    return ApiResponse.forbidden('Owner cannot leave the community. Transfer ownership first.');
                }

                // Check membership
                const membershipId = getMembershipId(communityId, uid);
                const membershipRef = db.collection('memberships').doc(membershipId);
                const existingMembership = await membershipRef.get();

                if (!existingMembership.exists) {
                    return ApiResponse.badRequest('Not a member of this community');
                }

                const memberRole = existingMembership.data()?.role;

                const batch = db.batch();

                // Delete membership
                batch.delete(membershipRef);

                // Decrement community member count
                batch.update(db.collection('communities').doc(communityId), {
                    memberCount: decrement(1),
                    updatedAt: serverTimestamp(),
                });

                // If moderator, remove from moderatorIds
                if (['moderator', 'admin'].includes(memberRole)) {
                    const moderatorIds = communityData?.moderatorIds?.filter((id: string) => id !== uid) || [];
                    batch.update(db.collection('communities').doc(communityId), {
                        moderatorIds,
                    });
                }

                await batch.commit();

                return ApiResponse.success({
                    message: 'Left community successfully',
                    communityId,
                });
            },
        },
        { id: communityId }
    );
}
