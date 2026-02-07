// src/app/api/posts/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';
import { createPostSchema } from '@/types/api';
import { DEFAULT_POST, DEFAULT_POST_METRICS } from '@/types/models';
import { increment, serverTimestamp } from '@/lib/db';

/**
 * GET /api/posts
 * List posts with pagination
 * Supports filtering by communityId
 */
export async function GET(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'list_posts',
        resource: { type: 'post', collection: 'posts' },
        handler: async ({ query }) => {
            const { limit, cursor, sortBy, sortOrder } = parsePagination(query);
            const communityId = query.get('communityId');
            const authorId = query.get('authorId');

            // Build query
            let dbQuery = db
                .collection('posts')
                .where('isDeleted', '!=', true)
                .where('isRemoved', '==', false);

            // Filter by community if provided
            if (communityId) {
                dbQuery = dbQuery.where('communityId', '==', communityId);
            }

            // Filter by author if provided
            if (authorId) {
                dbQuery = dbQuery.where('authorId', '==', authorId);
            }

            // Sort by the requested field
            const orderByField = sortBy === 'score' ? 'metrics.score' : 'createdAt';
            dbQuery = dbQuery.orderBy(orderByField, sortOrder || 'desc').limit(limit + 1);

            // Handle cursor pagination
            if (cursor) {
                const cursorDoc = await db.collection('posts').doc(cursor).get();
                if (cursorDoc.exists) {
                    dbQuery = dbQuery.startAfter(cursorDoc);
                }
            }

            const snapshot = await dbQuery.get();
            const docs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;

            const posts = docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));

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

/**
 * POST /api/posts
 * Create a new post
 */
export async function POST(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'create_post',
        resource: ({ body }) => ({
            type: 'post',
            collection: 'posts',
            communityId: body?.communityId,
        }),
        bodySchema: createPostSchema,
        handler: async ({ uid, claims, body }) => {
            const {
                title,
                content,
                communityId,
                tags,
                mediaUrl,
                mediaType,
                linkUrl,
                isNsfw,
                isSpoiler,
                flair,
            } = body;

            // If posting to a community, verify it exists and user can post
            if (communityId) {
                const communityDoc = await db.collection('communities').doc(communityId).get();
                if (!communityDoc.exists || communityDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Community');
                }

                const communityData = communityDoc.data();

                // Check if community is restricted
                if (communityData?.restrictPosting) {
                    // Check membership
                    const membershipDoc = await db
                        .collection('memberships')
                        .doc(`${communityId}_${uid}`)
                        .get();

                    if (!membershipDoc.exists || !membershipDoc.data()?.canPost) {
                        return ApiResponse.forbidden('You cannot post in this community');
                    }
                }
            }

            const postRef = db.collection('posts').doc();
            const now = new Date().toISOString();

            const postData = {
                ...DEFAULT_POST,
                id: postRef.id,
                title,
                content,
                authorId: uid,
                communityId: communityId || null,
                tags: tags || [],
                mediaUrl: mediaUrl || null,
                mediaType: mediaType || null,
                linkUrl: linkUrl || null,
                isNsfw: isNsfw || false,
                isSpoiler: isSpoiler || false,
                flair: flair || null,
                status: 'published',
                metrics: DEFAULT_POST_METRICS,
                createdAt: now,
                publishedAt: now,
            };

            const batch = db.batch();

            // Create post
            batch.set(postRef, postData);

            // Increment user post count
            batch.update(db.collection('users').doc(uid), {
                postCount: increment(1),
                updatedAt: serverTimestamp(),
            });

            // If posting to community, increment community post count
            if (communityId) {
                batch.update(db.collection('communities').doc(communityId), {
                    postCount: increment(1),
                    updatedAt: serverTimestamp(),
                });
            }

            await batch.commit();

            return ApiResponse.created(postData);
        },
    });
}
