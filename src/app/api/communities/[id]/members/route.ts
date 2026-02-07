// src/app/api/communities/[id]/members/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';
import { batchGetByIds } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/communities/[id]/members
 * List community members
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const { id: communityId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'list_community_members',
            resource: { type: 'community', id: communityId, collection: 'communities' },
            handler: async ({ query }) => {
                // Check if community exists
                const communityDoc = await db.collection('communities').doc(communityId).get();
                if (!communityDoc.exists || communityDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Community');
                }

                const { limit, cursor } = parsePagination(query);
                const roleFilter = query.get('role'); // Optional: filter by role

                // Get memberships
                let membershipsQuery = db
                    .collection('memberships')
                    .where('communityId', '==', communityId)
                    .where('isBanned', '==', false);

                if (roleFilter) {
                    membershipsQuery = membershipsQuery.where('role', '==', roleFilter);
                }

                membershipsQuery = membershipsQuery
                    .orderBy('joinedAt', 'desc')
                    .limit(limit + 1);

                if (cursor) {
                    const cursorDoc = await db.collection('memberships').doc(cursor).get();
                    if (cursorDoc.exists) {
                        membershipsQuery = membershipsQuery.startAfter(cursorDoc);
                    }
                }

                const snapshot = await membershipsQuery.get();
                const docs = snapshot.docs.slice(0, limit);
                const hasMore = snapshot.docs.length > limit;

                // Get user details
                const userIds = docs.map((doc) => doc.data().userId);
                const users = await batchGetByIds('users', userIds);
                const usersMap = new Map(
                    users.filter((u) => u.exists).map((u) => [u.id, u.data])
                );

                const members = docs.map((doc) => {
                    const membershipData = doc.data();
                    const userData = usersMap.get(membershipData.userId);
                    return {
                        id: doc.id,
                        role: membershipData.role,
                        joinedAt: membershipData.joinedAt,
                        user: userData
                            ? {
                                id: membershipData.userId,
                                username: userData.username,
                                displayName: userData.displayName,
                                photoURL: userData.photoURL,
                            }
                            : null,
                    };
                });

                const nextCursor =
                    hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined;

                return ApiResponse.paginated(members, {
                    page: 1,
                    limit,
                    hasMore,
                    nextCursor,
                });
            },
        },
        { id: communityId }
    );
}
