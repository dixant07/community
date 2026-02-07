// src/app/api/comments/[id]/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { updateCommentSchema } from '@/types/api';
import { decrement, serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/comments/[id]
 * Get a comment by ID
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'read_comment',
            resource: { type: 'comment', id, collection: 'comments' },
            handler: async ({ uid }) => {
                const doc = await db.collection('comments').doc(id).get();

                if (!doc.exists) {
                    return ApiResponse.notFound('Comment');
                }

                const commentData = doc.data();

                if (commentData?.isDeleted || commentData?.isRemoved) {
                    return ApiResponse.notFound('Comment');
                }

                // Get author info
                const authorDoc = await db
                    .collection('users')
                    .doc(commentData?.authorId)
                    .get();
                const authorData = authorDoc.exists ? authorDoc.data() : null;

                // Check user vote
                let userVote = null;
                if (uid) {
                    const voteDoc = await db
                        .collection('votes')
                        .doc(`${uid}_comment_${id}`)
                        .get();
                    if (voteDoc.exists) {
                        userVote = voteDoc.data()?.value;
                    }
                }

                return ApiResponse.success({
                    id: doc.id,
                    ...commentData,
                    author: authorData
                        ? {
                            id: authorDoc.id,
                            username: authorData.username,
                            displayName: authorData.displayName,
                            photoURL: authorData.photoURL,
                            role: authorData.role,
                        }
                        : null,
                    userVote,
                });
            },
        },
        { id }
    );
}

/**
 * PATCH /api/comments/[id]
 * Update a comment
 * Only author can update
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'update_comment',
            resource: async ({ params }) => {
                const commentDoc = await db.collection('comments').doc(params.id).get();
                return {
                    type: 'comment',
                    id: params.id,
                    collection: 'comments',
                    data: commentDoc.data(),
                };
            },
            bodySchema: updateCommentSchema,
            handler: async ({ uid, body }) => {
                const docRef = db.collection('comments').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('Comment');
                }

                const commentData = doc.data();

                if (commentData?.isDeleted) {
                    return ApiResponse.notFound('Comment');
                }

                // Check ownership
                if (commentData?.authorId !== uid) {
                    return ApiResponse.forbidden('You can only edit your own comments');
                }

                await docRef.update({
                    content: body.content,
                    updatedAt: serverTimestamp(),
                });

                const updatedDoc = await docRef.get();

                return ApiResponse.success({
                    id: updatedDoc.id,
                    ...updatedDoc.data(),
                });
            },
        },
        { id }
    );
}

/**
 * DELETE /api/comments/[id]
 * Delete a comment (soft delete)
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'delete_comment',
            resource: async ({ params }) => {
                const commentDoc = await db.collection('comments').doc(params.id).get();
                return {
                    type: 'comment',
                    id: params.id,
                    collection: 'comments',
                    data: commentDoc.data(),
                };
            },
            handler: async () => {
                const docRef = db.collection('comments').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('Comment');
                }

                const commentData = doc.data();

                if (commentData?.isDeleted) {
                    return ApiResponse.notFound('Comment');
                }

                const batch = db.batch();

                // Soft delete
                batch.update(docRef, {
                    isDeleted: true,
                    deletedAt: new Date().toISOString(),
                    content: '[deleted]',
                });

                // Decrement post comment count
                if (commentData?.postId) {
                    batch.update(db.collection('posts').doc(commentData.postId), {
                        'metrics.commentCount': decrement(1),
                        updatedAt: serverTimestamp(),
                    });
                }

                // Decrement user comment count
                if (commentData?.authorId) {
                    batch.update(db.collection('users').doc(commentData.authorId), {
                        commentCount: decrement(1),
                        updatedAt: serverTimestamp(),
                    });
                }

                // Decrement parent reply count
                if (commentData?.parentCommentId) {
                    batch.update(db.collection('comments').doc(commentData.parentCommentId), {
                        'metrics.replyCount': decrement(1),
                        updatedAt: serverTimestamp(),
                    });
                }

                await batch.commit();

                return ApiResponse.success({
                    message: 'Comment deleted successfully',
                    id,
                });
            },
        },
        { id }
    );
}
