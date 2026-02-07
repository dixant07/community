// src/app/api/users/[id]/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { updateUserSchema } from '@/types/api';
import { serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/users/[id]
 * Get a user by ID
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'read_user',
            resource: { type: 'user', id, collection: 'users' },
            handler: async () => {
                const doc = await db.collection('users').doc(id).get();

                if (!doc.exists) {
                    return ApiResponse.notFound('User');
                }

                const userData = doc.data();

                // Check if deleted
                if (userData?.isDeleted) {
                    return ApiResponse.notFound('User');
                }

                // Don't expose sensitive fields
                const { bannedReason, suspendedReason, ...publicData } = userData || {};

                return ApiResponse.success({
                    id: doc.id,
                    ...publicData,
                });
            },
        },
        { id }
    );
}

/**
 * PATCH /api/users/[id]
 * Update a user
 * User can only update their own profile (enforced by OPA)
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'update_user',
            resource: { type: 'user', id, collection: 'users' },
            bodySchema: updateUserSchema,
            handler: async ({ uid, body }) => {
                // Additional check: users can only update their own profile
                if (id !== uid) {
                    return ApiResponse.forbidden('You can only update your own profile');
                }

                const docRef = db.collection('users').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('User');
                }

                const userData = doc.data();
                if (userData?.isDeleted) {
                    return ApiResponse.notFound('User');
                }

                // Update user
                const updateData = {
                    ...body,
                    updatedAt: serverTimestamp(),
                };

                await docRef.update(updateData);

                // Fetch updated document
                const updatedDoc = await docRef.get();
                const updatedData = updatedDoc.data();
                const { bannedReason, suspendedReason, ...publicData } = updatedData || {};

                return ApiResponse.success({
                    id: updatedDoc.id,
                    ...publicData,
                });
            },
        },
        { id }
    );
}

/**
 * DELETE /api/users/[id]
 * Delete a user (soft delete)
 * Only admins can delete users, or user can delete themselves
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'delete_user',
            resource: { type: 'user', id, collection: 'users' },
            handler: async () => {
                const docRef = db.collection('users').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('User');
                }

                const userData = doc.data();
                if (userData?.isDeleted) {
                    return ApiResponse.notFound('User');
                }

                const username = userData?.username;

                // Soft delete - mark as deleted
                await docRef.update({
                    isDeleted: true,
                    deletedAt: serverTimestamp(),
                });

                // Remove username reservation
                if (username) {
                    await db.collection('usernames').doc(username.toLowerCase()).delete();
                }

                return ApiResponse.success({
                    message: 'User deleted successfully',
                    id,
                });
            },
        },
        { id }
    );
}
