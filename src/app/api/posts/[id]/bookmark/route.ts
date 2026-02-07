// src/app/api/posts/[id]/bookmark/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { getBookmarkId } from '@/types/models';
import { increment, decrement, serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/posts/[id]/bookmark
 * Bookmark a post
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id: postId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'bookmark_post',
            resource: { type: 'post', id: postId, collection: 'posts' },
            handler: async ({ uid }) => {
                // Check if post exists
                const postDoc = await db.collection('posts').doc(postId).get();
                if (!postDoc.exists || postDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Post');
                }

                const bookmarkId = getBookmarkId(uid, postId);
                const bookmarkRef = db.collection('bookmarks').doc(bookmarkId);
                const existing = await bookmarkRef.get();

                if (existing.exists) {
                    return ApiResponse.conflict('Post already bookmarked');
                }

                const batch = db.batch();

                batch.set(bookmarkRef, {
                    id: bookmarkId,
                    userId: uid,
                    postId,
                    createdAt: new Date().toISOString(),
                });

                batch.update(db.collection('posts').doc(postId), {
                    'metrics.bookmarkCount': increment(1),
                    updatedAt: serverTimestamp(),
                });

                await batch.commit();

                return ApiResponse.success({
                    message: 'Post bookmarked',
                    postId,
                });
            },
        },
        { id: postId }
    );
}

/**
 * DELETE /api/posts/[id]/bookmark
 * Remove bookmark from a post
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id: postId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'unbookmark_post',
            resource: { type: 'post', id: postId, collection: 'posts' },
            handler: async ({ uid }) => {
                const bookmarkId = getBookmarkId(uid, postId);
                const bookmarkRef = db.collection('bookmarks').doc(bookmarkId);
                const existing = await bookmarkRef.get();

                if (!existing.exists) {
                    return ApiResponse.badRequest('Post not bookmarked');
                }

                const batch = db.batch();

                batch.delete(bookmarkRef);

                batch.update(db.collection('posts').doc(postId), {
                    'metrics.bookmarkCount': decrement(1),
                    updatedAt: serverTimestamp(),
                });

                await batch.commit();

                return ApiResponse.success({
                    message: 'Bookmark removed',
                    postId,
                });
            },
        },
        { id: postId }
    );
}
