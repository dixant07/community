// src/app/api/feed/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';
import { batchGetByIds } from '@/lib/db';

/**
 * GET /api/feed
 * Get personalized home feed for the authenticated user
 * Returns posts from:
 * 1. Communities the user is a member of
 * 2. Users the user follows
 * 3. Popular/trending posts (fallback)
 */
export async function GET(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'read_feed',
        resource: { type: 'feed', collection: 'posts' },
        handler: async ({ uid, query }) => {
            const { limit, cursor, sortBy } = parsePagination(query);
            const feedType = query.get('type') || 'home'; // home, popular, new

            // Get user's subscribed communities
            const membershipsSnapshot = await db
                .collection('memberships')
                .where('userId', '==', uid)
                .where('isBanned', '==', false)
                .limit(100)
                .get();

            const communityIds = membershipsSnapshot.docs.map(
                (doc) => doc.data().communityId
            );

            // Get users the current user follows
            const followsSnapshot = await db
                .collection('follows')
                .where('followerId', '==', uid)
                .limit(100)
                .get();

            const followingIds = followsSnapshot.docs.map(
                (doc) => doc.data().followeeId
            );

            // Build feed query based on type
            let feedQuery = db
                .collection('posts')
                .where('isDeleted', '!=', true)
                .where('isRemoved', '==', false);

            if (feedType === 'home' && (communityIds.length > 0 || followingIds.length > 0)) {
                // Home feed: posts from subscribed communities or followed users
                // Firestore limitation: can only use 'in' with up to 30 values
                if (communityIds.length > 0 && communityIds.length <= 30) {
                    feedQuery = feedQuery.where('communityId', 'in', communityIds.slice(0, 30));
                } else if (followingIds.length > 0 && followingIds.length <= 30) {
                    feedQuery = feedQuery.where('authorId', 'in', followingIds.slice(0, 30));
                }
            }

            // Sort order based on type
            const orderField =
                sortBy === 'score' || feedType === 'popular'
                    ? 'metrics.score'
                    : 'createdAt';

            feedQuery = feedQuery
                .orderBy(orderField, 'desc')
                .limit(limit + 1);

            if (cursor) {
                const cursorDoc = await db.collection('posts').doc(cursor).get();
                if (cursorDoc.exists) {
                    feedQuery = feedQuery.startAfter(cursorDoc);
                }
            }

            const snapshot = await feedQuery.get();
            const docs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;

            // Get author info for all posts
            const authorIds = [...new Set(docs.map((doc) => doc.data().authorId))];
            const authors = await batchGetByIds('users', authorIds);
            const authorsMap = new Map(
                authors.filter((a) => a.exists).map((a) => [a.id, a.data])
            );

            // Get community info
            const postCommunityIds = [...new Set(
                docs.map((doc) => doc.data().communityId).filter(Boolean)
            )];
            const communities = await batchGetByIds('communities', postCommunityIds as string[]);
            const communitiesMap = new Map(
                communities.filter((c) => c.exists).map((c) => [c.id, c.data])
            );

            // Get user votes for these posts
            const voteIds = docs.map((doc) => `${uid}_post_${doc.id}`);
            const votes = await batchGetByIds('votes', voteIds);
            const votesMap = new Map(
                votes.filter((v) => v.exists).map((v) => [v.data?.targetId as string, v.data?.value])
            );

            const posts = docs.map((doc) => {
                const data = doc.data();
                const authorData = authorsMap.get(data.authorId);
                const communityData = data.communityId
                    ? communitiesMap.get(data.communityId)
                    : null;

                return {
                    id: doc.id,
                    ...data,
                    author: authorData
                        ? {
                            id: data.authorId,
                            username: authorData.username,
                            displayName: authorData.displayName,
                            photoURL: authorData.photoURL,
                        }
                        : null,
                    community: communityData
                        ? {
                            id: data.communityId,
                            name: communityData.name,
                            slug: communityData.slug,
                            icon: communityData.icon,
                        }
                        : null,
                    userVote: votesMap.get(doc.id) || null,
                };
            });

            const nextCursor =
                hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined;

            return ApiResponse.paginated(posts, {
                page: 1,
                limit,
                hasMore,
                nextCursor,
            });
        },
    });
}
