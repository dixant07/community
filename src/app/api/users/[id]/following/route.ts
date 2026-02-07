// src/app/api/users/[id]/following/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';
import { batchGetByIds } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/users/[id]/following
 * Get list of users this user follows
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const { id: userId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'list_following',
            resource: { type: 'user', id: userId, collection: 'users' },
            handler: async ({ query }) => {
                // Check if user exists
                const userDoc = await db.collection('users').doc(userId).get();
                if (!userDoc.exists || userDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('User');
                }

                const { limit, cursor } = parsePagination(query);

                // Get follows where this user is the follower
                let followsQuery = db
                    .collection('follows')
                    .where('followerId', '==', userId)
                    .orderBy('createdAt', 'desc')
                    .limit(limit + 1);

                if (cursor) {
                    const cursorDoc = await db.collection('follows').doc(cursor).get();
                    if (cursorDoc.exists) {
                        followsQuery = followsQuery.startAfter(cursorDoc);
                    }
                }

                const snapshot = await followsQuery.get();
                const docs = snapshot.docs.slice(0, limit);
                const hasMore = snapshot.docs.length > limit;

                // Get following user details
                const followingIds = docs.map((doc) => doc.data().followingId);
                const following = await batchGetByIds('users', followingIds);

                const followingData = following
                    .filter((f) => f.exists && !f.data?.isDeleted)
                    .map((f) => ({
                        id: f.id,
                        username: f.data?.username,
                        displayName: f.data?.displayName,
                        photoURL: f.data?.photoURL,
                        role: f.data?.role,
                        followerCount: f.data?.followerCount,
                    }));

                const nextCursor =
                    hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined;

                return ApiResponse.paginated(followingData, {
                    page: 1,
                    limit,
                    hasMore,
                    nextCursor,
                });
            },
        },
        { id: userId }
    );
}
