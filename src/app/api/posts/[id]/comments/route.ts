// src/app/api/posts/[id]/comments/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';
import { batchGetByIds } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/posts/[id]/comments
 * Get comments for a post
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const { id: postId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'list_comments',
            resource: { type: 'comment', postId, collection: 'comments' },
            handler: async ({ uid, query }) => {
                // Check if post exists
                const postDoc = await db.collection('posts').doc(postId).get();
                if (!postDoc.exists || postDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Post');
                }

                const { limit, cursor, sortBy, sortOrder } = parsePagination(query);
                const parentId = query.get('parentId') || null; // For nested comments

                // Build query
                let commentsQuery = db
                    .collection('comments')
                    .where('postId', '==', postId)
                    .where('isDeleted', '!=', true);

                // Filter by parent for nested comments
                if (parentId) {
                    commentsQuery = commentsQuery.where('parentCommentId', '==', parentId);
                } else {
                    // Top-level comments only
                    commentsQuery = commentsQuery.where('depth', '==', 0);
                }

                // Sort
                const orderByField = sortBy === 'score' ? 'metrics.score' : 'createdAt';
                commentsQuery = commentsQuery
                    .orderBy(orderByField, sortOrder || 'desc')
                    .limit(limit + 1);

                if (cursor) {
                    const cursorDoc = await db.collection('comments').doc(cursor).get();
                    if (cursorDoc.exists) {
                        commentsQuery = commentsQuery.startAfter(cursorDoc);
                    }
                }

                const snapshot = await commentsQuery.get();
                const docs = snapshot.docs.slice(0, limit);
                const hasMore = snapshot.docs.length > limit;

                // Get author info for all comments
                const authorIds = [...new Set(docs.map((doc) => doc.data().authorId))];
                const authors = await batchGetByIds('users', authorIds);
                const authorsMap = new Map(
                    authors.filter((a) => a.exists).map((a) => [a.id, a.data])
                );

                // Get user votes if authenticated
                const userVotes = new Map<string, number>();
                if (uid) {
                    const voteIds = docs.map((doc) => `${uid}_comment_${doc.id}`);
                    const votes = await batchGetByIds('votes', voteIds);
                    votes
                        .filter((v) => v.exists)
                        .forEach((v) => {
                            const commentId = v.data?.targetId;
                            if (commentId) {
                                userVotes.set(commentId as string, v.data?.value as number);
                            }
                        });
                }

                const comments = docs.map((doc) => {
                    const data = doc.data();
                    const authorData = authorsMap.get(data.authorId);
                    return {
                        id: doc.id,
                        ...data,
                        author: authorData
                            ? {
                                id: data.authorId,
                                username: authorData.username,
                                displayName: authorData.displayName,
                                photoURL: authorData.photoURL,
                                role: authorData.role,
                            }
                            : null,
                        userVote: userVotes.get(doc.id) || null,
                    };
                });

                const nextCursor =
                    hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined;

                return ApiResponse.paginated(comments, {
                    page: 1,
                    limit,
                    hasMore,
                    nextCursor,
                });
            },
        },
        { id: postId }
    );
}
