// src/app/api/comments/[id]/vote/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { voteSchema } from '@/types/api';
import { getVoteId } from '@/types/models';
import { increment, decrement, serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/comments/[id]/vote
 * Upvote or downvote a comment
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id: commentId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'vote_comment',
            resource: { type: 'comment', id: commentId, collection: 'comments' },
            bodySchema: voteSchema,
            handler: async ({ uid, body }) => {
                const { value } = body;

                // Check if comment exists
                const commentDoc = await db.collection('comments').doc(commentId).get();
                if (!commentDoc.exists || commentDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Comment');
                }

                const commentData = commentDoc.data();

                // Check if voting on own comment
                if (commentData?.authorId === uid) {
                    return ApiResponse.badRequest('You cannot vote on your own comment');
                }

                const voteId = getVoteId(uid, commentId, 'comment');
                const voteRef = db.collection('votes').doc(voteId);
                const existingVote = await voteRef.get();

                const batch = db.batch();
                const commentRef = db.collection('comments').doc(commentId);
                const authorRef = db.collection('users').doc(commentData?.authorId);

                if (existingVote.exists) {
                    const existingValue = existingVote.data()?.value;

                    if (existingValue === value) {
                        return ApiResponse.conflict('Already voted with this value');
                    }

                    // Change vote direction
                    batch.update(voteRef, {
                        value,
                        updatedAt: new Date().toISOString(),
                    });

                    if (value === 1) {
                        batch.update(commentRef, {
                            'metrics.upvotes': increment(1),
                            'metrics.downvotes': decrement(1),
                            'metrics.score': increment(2),
                            updatedAt: serverTimestamp(),
                        });
                        batch.update(authorRef, {
                            karma: increment(2),
                            updatedAt: serverTimestamp(),
                        });
                    } else {
                        batch.update(commentRef, {
                            'metrics.upvotes': decrement(1),
                            'metrics.downvotes': increment(1),
                            'metrics.score': decrement(2),
                            updatedAt: serverTimestamp(),
                        });
                        batch.update(authorRef, {
                            karma: decrement(2),
                            updatedAt: serverTimestamp(),
                        });
                    }
                } else {
                    // New vote
                    batch.set(voteRef, {
                        id: voteId,
                        userId: uid,
                        targetId: commentId,
                        targetType: 'comment',
                        value,
                        createdAt: new Date().toISOString(),
                    });

                    if (value === 1) {
                        batch.update(commentRef, {
                            'metrics.upvotes': increment(1),
                            'metrics.score': increment(1),
                            updatedAt: serverTimestamp(),
                        });
                        batch.update(authorRef, {
                            karma: increment(1),
                            updatedAt: serverTimestamp(),
                        });
                    } else {
                        batch.update(commentRef, {
                            'metrics.downvotes': increment(1),
                            'metrics.score': decrement(1),
                            updatedAt: serverTimestamp(),
                        });
                        batch.update(authorRef, {
                            karma: decrement(1),
                            updatedAt: serverTimestamp(),
                        });
                    }
                }

                await batch.commit();

                return ApiResponse.success({
                    message: value === 1 ? 'Upvoted' : 'Downvoted',
                    commentId,
                    value,
                });
            },
        },
        { id: commentId }
    );
}

/**
 * DELETE /api/comments/[id]/vote
 * Remove vote from a comment
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id: commentId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'unvote_comment',
            resource: { type: 'comment', id: commentId, collection: 'comments' },
            handler: async ({ uid }) => {
                const voteId = getVoteId(uid, commentId, 'comment');
                const voteRef = db.collection('votes').doc(voteId);
                const existingVote = await voteRef.get();

                if (!existingVote.exists) {
                    return ApiResponse.badRequest('No vote to remove');
                }

                const voteValue = existingVote.data()?.value;

                const commentDoc = await db.collection('comments').doc(commentId).get();
                if (!commentDoc.exists) {
                    return ApiResponse.notFound('Comment');
                }

                const commentData = commentDoc.data();
                const batch = db.batch();
                const commentRef = db.collection('comments').doc(commentId);
                const authorRef = db.collection('users').doc(commentData?.authorId);

                batch.delete(voteRef);

                if (voteValue === 1) {
                    batch.update(commentRef, {
                        'metrics.upvotes': decrement(1),
                        'metrics.score': decrement(1),
                        updatedAt: serverTimestamp(),
                    });
                    batch.update(authorRef, {
                        karma: decrement(1),
                        updatedAt: serverTimestamp(),
                    });
                } else {
                    batch.update(commentRef, {
                        'metrics.downvotes': decrement(1),
                        'metrics.score': increment(1),
                        updatedAt: serverTimestamp(),
                    });
                    batch.update(authorRef, {
                        karma: increment(1),
                        updatedAt: serverTimestamp(),
                    });
                }

                await batch.commit();

                return ApiResponse.success({
                    message: 'Vote removed',
                    commentId,
                });
            },
        },
        { id: commentId }
    );
}
