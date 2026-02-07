// src/app/api/comments/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { createCommentSchema } from '@/types/api';
import { DEFAULT_COMMENT, DEFAULT_COMMENT_METRICS } from '@/types/models';
import { increment, serverTimestamp } from '@/lib/db';

/**
 * POST /api/comments
 * Create a new comment on a post
 */
export async function POST(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'create_comment',
        resource: ({ body }) => ({
            type: 'comment',
            collection: 'comments',
            postId: body?.postId,
        }),
        bodySchema: createCommentSchema,
        handler: async ({ uid, body }) => {
            const { postId, content, parentCommentId } = body;

            // Check if post exists
            const postDoc = await db.collection('posts').doc(postId).get();
            if (!postDoc.exists || postDoc.data()?.isDeleted) {
                return ApiResponse.notFound('Post');
            }

            const postData = postDoc.data();

            // Check if post is locked
            if (postData?.isLocked) {
                return ApiResponse.forbidden('This post is locked for comments');
            }

            let depth = 0;
            let path: string[] = [];

            // If replying to a comment, get parent info
            if (parentCommentId) {
                const parentDoc = await db.collection('comments').doc(parentCommentId).get();
                if (!parentDoc.exists || parentDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Parent comment');
                }

                const parentData = parentDoc.data();

                // Verify parent belongs to same post
                if (parentData?.postId !== postId) {
                    return ApiResponse.badRequest('Parent comment belongs to different post');
                }

                depth = (parentData?.depth || 0) + 1;
                path = [...(parentData?.path || []), parentCommentId];

                // Limit nesting depth
                if (depth > 10) {
                    return ApiResponse.badRequest('Maximum comment nesting depth reached');
                }
            }

            const commentRef = db.collection('comments').doc();
            const now = new Date().toISOString();

            const commentData = {
                ...DEFAULT_COMMENT,
                id: commentRef.id,
                postId,
                authorId: uid,
                content,
                parentCommentId: parentCommentId || null,
                depth,
                path,
                status: 'published',
                metrics: DEFAULT_COMMENT_METRICS,
                createdAt: now,
            };

            const batch = db.batch();

            // Create comment
            batch.set(commentRef, commentData);

            // Increment post comment count
            batch.update(db.collection('posts').doc(postId), {
                'metrics.commentCount': increment(1),
                updatedAt: serverTimestamp(),
            });

            // Increment user comment count
            batch.update(db.collection('users').doc(uid), {
                commentCount: increment(1),
                updatedAt: serverTimestamp(),
            });

            // If reply, increment parent reply count
            if (parentCommentId) {
                batch.update(db.collection('comments').doc(parentCommentId), {
                    'metrics.replyCount': increment(1),
                    updatedAt: serverTimestamp(),
                });
            }

            await batch.commit();

            // Create notification for post author (if not self-comment)
            if (postData?.authorId !== uid) {
                await db.collection('notifications').add({
                    userId: postData?.authorId,
                    type: parentCommentId ? 'reply' : 'comment',
                    actorId: uid,
                    targetId: commentRef.id,
                    targetType: 'comment',
                    targetTitle: content.substring(0, 100),
                    title: parentCommentId ? 'New reply' : 'New comment',
                    body: `on your post: ${postData?.title?.substring(0, 50)}`,
                    link: `/post/${postId}#comment-${commentRef.id}`,
                    isRead: false,
                    isArchived: false,
                    createdAt: now,
                });
            }

            return ApiResponse.created(commentData);
        },
    });
}
