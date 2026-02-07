// src/app/api/trending/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';
import { batchGetByIds } from '@/lib/db';

/**
 * GET /api/trending
 * Get trending posts and communities
 */
export async function GET(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'read_trending',
        resource: { type: 'trending', collection: 'trending' },
        handler: async ({ uid, query }) => {
            const { limit } = parsePagination(query);
            const trendingType = query.get('type') || 'all'; // all, posts, communities
            const timeFrame = query.get('timeFrame') || 'day'; // day, week, month

            // Calculate time threshold based on timeFrame
            const now = new Date();
            let timeThreshold: Date;
            switch (timeFrame) {
                case 'week':
                    timeThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    timeThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                default: // day
                    timeThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            }

            const results: {
                posts: unknown[];
                communities: unknown[];
            } = {
                posts: [],
                communities: [],
            };

            // Get trending posts (sorted by score within timeframe)
            if (trendingType === 'all' || trendingType === 'posts') {
                const postsSnapshot = await db
                    .collection('posts')
                    .where('isDeleted', '!=', true)
                    .where('createdAt', '>=', timeThreshold.toISOString())
                    .orderBy('createdAt', 'desc')
                    .orderBy('metrics.score', 'desc')
                    .limit(limit)
                    .get();

                // Get author info
                const authorIds = [...new Set(
                    postsSnapshot.docs.map((doc) => doc.data().authorId)
                )];
                const authors = await batchGetByIds('users', authorIds);
                const authorsMap = new Map(
                    authors.filter((a) => a.exists).map((a) => [a.id, a.data])
                );

                // Get community info
                const communityIds = [...new Set(
                    postsSnapshot.docs
                        .map((doc) => doc.data().communityId)
                        .filter(Boolean)
                )];
                const communities = await batchGetByIds('communities', communityIds as string[]);
                const communitiesMap = new Map(
                    communities.filter((c) => c.exists).map((c) => [c.id, c.data])
                );

                // Get user votes
                const voteIds = postsSnapshot.docs.map((doc) => `${uid}_post_${doc.id}`);
                const votes = await batchGetByIds('votes', voteIds);
                const votesMap = new Map(
                    votes.filter((v) => v.exists).map((v) => [v.data?.targetId as string, v.data?.value])
                );

                results.posts = postsSnapshot.docs.map((doc) => {
                    const data = doc.data();
                    const authorData = authorsMap.get(data.authorId);
                    const communityData = data.communityId
                        ? communitiesMap.get(data.communityId)
                        : null;

                    return {
                        id: doc.id,
                        title: data.title,
                        content: data.content?.substring(0, 200),
                        authorId: data.authorId,
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
                            }
                            : null,
                        metrics: data.metrics,
                        userVote: votesMap.get(doc.id) || null,
                        createdAt: data.createdAt,
                    };
                });
            }

            // Get trending communities (by member count growth or activity)
            if (trendingType === 'all' || trendingType === 'communities') {
                const communitiesSnapshot = await db
                    .collection('communities')
                    .where('isDeleted', '!=', true)
                    .orderBy('isDeleted')
                    .orderBy('memberCount', 'desc')
                    .limit(limit)
                    .get();

                results.communities = communitiesSnapshot.docs.map((doc) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        name: data.name,
                        slug: data.slug,
                        description: data.description,
                        memberCount: data.memberCount,
                        postCount: data.postCount,
                        icon: data.icon,
                        banner: data.banner,
                    };
                });
            }

            return ApiResponse.success({
                timeFrame,
                type: trendingType,
                results,
            });
        },
    });
}
