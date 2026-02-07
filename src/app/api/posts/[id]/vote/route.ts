// src/app/api/posts/[id]/vote/route.ts

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
 * POST /api/posts/[id]/vote
 * Upvote or downvote a post
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id: postId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'vote_post',
            resource: { type: 'post', id: postId, collection: 'posts' },
            bodySchema: voteSchema,
            handler: async ({ uid, body }) => {
                const { value } = body;

                // Check if post exists
                const postDoc = await db.collection('posts').doc(postId).get();
                if (!postDoc.exists || postDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Post');
                }

                const postData = postDoc.data();

                // Check if voting on own post
                if (postData?.authorId === uid) {
                    return ApiResponse.badRequest('You cannot vote on your own post');
                }

                const voteId = getVoteId(uid, postId, 'post');
                const voteRef = db.collection('votes').doc(voteId);
                const existingVote = await voteRef.get();

                const batch = db.batch();
                const postRef = db.collection('posts').doc(postId);
                const authorRef = db.collection('users').doc(postData?.authorId);

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

                    // Update post metrics (swing of 2)
                    if (value === 1) {
                        // Changing from downvote to upvote
                        batch.update(postRef, {
                            'metrics.upvotes': increment(1),
                            'metrics.downvotes': decrement(1),
                            'metrics.score': increment(2),
                            updatedAt: serverTimestamp(),
                        });
                        // Update author karma
                        batch.update(authorRef, {
                            karma: increment(2),
                            updatedAt: serverTimestamp(),
                        });
                    } else {
                        // Changing from upvote to downvote
                        batch.update(postRef, {
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
                        targetId: postId,
                        targetType: 'post',
                        value,
                        createdAt: new Date().toISOString(),
                    });

                    if (value === 1) {
                        batch.update(postRef, {
                            'metrics.upvotes': increment(1),
                            'metrics.score': increment(1),
                            updatedAt: serverTimestamp(),
                        });
                        batch.update(authorRef, {
                            karma: increment(1),
                            updatedAt: serverTimestamp(),
                        });
                    } else {
                        batch.update(postRef, {
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
                    postId,
                    value,
                });
            },
        },
        { id: postId }
    );
}

/**
 * DELETE /api/posts/[id]/vote
 * Remove vote from a post
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id: postId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'unvote_post',
            resource: { type: 'post', id: postId, collection: 'posts' },
            handler: async ({ uid }) => {
                const voteId = getVoteId(uid, postId, 'post');
                const voteRef = db.collection('votes').doc(voteId);
                const existingVote = await voteRef.get();

                if (!existingVote.exists) {
                    return ApiResponse.badRequest('No vote to remove');
                }

                const voteValue = existingVote.data()?.value;

                // Get post for author info
                const postDoc = await db.collection('posts').doc(postId).get();
                if (!postDoc.exists) {
                    return ApiResponse.notFound('Post');
                }

                const postData = postDoc.data();
                const batch = db.batch();
                const postRef = db.collection('posts').doc(postId);
                const authorRef = db.collection('users').doc(postData?.authorId);

                // Delete vote
                batch.delete(voteRef);

                // Reverse the vote effect
                if (voteValue === 1) {
                    batch.update(postRef, {
                        'metrics.upvotes': decrement(1),
                        'metrics.score': decrement(1),
                        updatedAt: serverTimestamp(),
                    });
                    batch.update(authorRef, {
                        karma: decrement(1),
                        updatedAt: serverTimestamp(),
                    });
                } else {
                    batch.update(postRef, {
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
                    postId,
                });
            },
        },
        { id: postId }
    );
}
