// src/app/api/users/[id]/follow/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { increment, decrement, serverTimestamp } from '@/lib/db';
import { getFollowId } from '@/types/models';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/users/[id]/follow
 * Follow a user
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id: targetUserId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'follow_user',
            resource: { type: 'user', id: targetUserId, collection: 'users' },
            handler: async ({ uid }) => {
                // Cannot follow yourself
                if (targetUserId === uid) {
                    return ApiResponse.badRequest('You cannot follow yourself');
                }

                // Check if target user exists
                const targetDoc = await db.collection('users').doc(targetUserId).get();
                if (!targetDoc.exists || targetDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('User');
                }

                const followId = getFollowId(uid, targetUserId);
                const followRef = db.collection('follows').doc(followId);
                const existingFollow = await followRef.get();

                if (existingFollow.exists) {
                    return ApiResponse.conflict('Already following this user');
                }

                const batch = db.batch();

                // Create follow document
                batch.set(followRef, {
                    id: followId,
                    followerId: uid,
                    followingId: targetUserId,
                    createdAt: new Date().toISOString(),
                });

                // Increment follower count for target user
                batch.update(db.collection('users').doc(targetUserId), {
                    followerCount: increment(1),
                    updatedAt: serverTimestamp(),
                });

                // Increment following count for current user
                batch.update(db.collection('users').doc(uid), {
                    followingCount: increment(1),
                    updatedAt: serverTimestamp(),
                });

                await batch.commit();

                // Create notification for target user
                await db.collection('notifications').add({
                    userId: targetUserId,
                    type: 'follow',
                    actorId: uid,
                    title: 'New follower',
                    body: 'Someone started following you',
                    link: `/user/${uid}`,
                    isRead: false,
                    isArchived: false,
                    createdAt: new Date().toISOString(),
                });

                return ApiResponse.success({
                    message: 'Successfully followed user',
                    followingId: targetUserId,
                });
            },
        },
        { id: targetUserId }
    );
}

/**
 * DELETE /api/users/[id]/follow
 * Unfollow a user
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id: targetUserId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'unfollow_user',
            resource: { type: 'user', id: targetUserId, collection: 'users' },
            handler: async ({ uid }) => {
                const followId = getFollowId(uid, targetUserId);
                const followRef = db.collection('follows').doc(followId);
                const existingFollow = await followRef.get();

                if (!existingFollow.exists) {
                    return ApiResponse.badRequest('Not following this user');
                }

                const batch = db.batch();

                // Delete follow document
                batch.delete(followRef);

                // Decrement follower count for target user
                batch.update(db.collection('users').doc(targetUserId), {
                    followerCount: decrement(1),
                    updatedAt: serverTimestamp(),
                });

                // Decrement following count for current user
                batch.update(db.collection('users').doc(uid), {
                    followingCount: decrement(1),
                    updatedAt: serverTimestamp(),
                });

                await batch.commit();

                return ApiResponse.success({
                    message: 'Successfully unfollowed user',
                    unfollowedId: targetUserId,
                });
            },
        },
        { id: targetUserId }
    );
}
