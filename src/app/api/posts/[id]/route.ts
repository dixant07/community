// src/app/api/posts/[id]/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { updatePostSchema } from '@/types/api';
import { increment, decrement, serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/posts/[id]
 * Get a post by ID
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'read_post',
            resource: { type: 'post', id, collection: 'posts' },
            handler: async ({ uid }) => {
                const docRef = db.collection('posts').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('Post');
                }

                const postData = doc.data();

                if (postData?.isDeleted || postData?.isRemoved) {
                    return ApiResponse.notFound('Post');
                }

                // Increment view count (fire and forget)
                docRef.update({
                    'metrics.viewCount': increment(1),
                }).catch(() => { }); // Ignore errors

                // Get author info
                const authorDoc = await db.collection('users').doc(postData?.authorId).get();
                const authorData = authorDoc.exists ? authorDoc.data() : null;

                // Check if current user has voted
                let userVote = null;
                if (uid) {
                    const voteDoc = await db
                        .collection('votes')
                        .doc(`${uid}_post_${id}`)
                        .get();
                    if (voteDoc.exists) {
                        userVote = voteDoc.data()?.value;
                    }
                }

                // Check if current user has bookmarked
                let isBookmarked = false;
                if (uid) {
                    const bookmarkDoc = await db
                        .collection('bookmarks')
                        .doc(`${uid}_${id}`)
                        .get();
                    isBookmarked = bookmarkDoc.exists;
                }

                return ApiResponse.success({
                    id: doc.id,
                    ...postData,
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
                    isBookmarked,
                });
            },
        },
        { id }
    );
}

/**
 * PATCH /api/posts/[id]
 * Update a post
 * Only the author or admins can update
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'update_post',
            resource: async ({ params }) => {
                const postDoc = await db.collection('posts').doc(params.id).get();
                return {
                    type: 'post',
                    id: params.id,
                    collection: 'posts',
                    data: postDoc.data(),
                };
            },
            bodySchema: updatePostSchema,
            handler: async ({ uid, claims, body }) => {
                const docRef = db.collection('posts').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('Post');
                }

                const postData = doc.data();

                if (postData?.isDeleted) {
                    return ApiResponse.notFound('Post');
                }

                // Check ownership (OPA also checks this)
                const isOwner = postData?.authorId === uid;
                const isAdmin =
                    claims?.role === 'admin' || claims?.role === 'super_admin';

                if (!isOwner && !isAdmin) {
                    return ApiResponse.forbidden('You can only edit your own posts');
                }

                // Update post
                const updateData = {
                    ...body,
                    updatedAt: serverTimestamp(),
                };

                await docRef.update(updateData);

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
 * DELETE /api/posts/[id]
 * Delete a post (soft delete)
 * Only the author or admins can delete
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'delete_post',
            resource: async ({ params }) => {
                const postDoc = await db.collection('posts').doc(params.id).get();
                return {
                    type: 'post',
                    id: params.id,
                    collection: 'posts',
                    data: postDoc.data(),
                };
            },
            handler: async () => {
                const docRef = db.collection('posts').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('Post');
                }

                const postData = doc.data();

                if (postData?.isDeleted) {
                    return ApiResponse.notFound('Post');
                }

                const batch = db.batch();

                // Soft delete
                batch.update(docRef, {
                    isDeleted: true,
                    deletedAt: new Date().toISOString(),
                });

                // Decrement user post count
                batch.update(db.collection('users').doc(postData?.authorId), {
                    postCount: decrement(1),
                    updatedAt: serverTimestamp(),
                });

                // If in community, decrement community post count
                if (postData?.communityId) {
                    batch.update(db.collection('communities').doc(postData.communityId), {
                        postCount: decrement(1),
                        updatedAt: serverTimestamp(),
                    });
                }

                await batch.commit();

                return ApiResponse.success({
                    message: 'Post deleted successfully',
                    id,
                });
            },
        },
        { id }
    );
}
