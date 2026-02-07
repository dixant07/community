// src/app/api/users/[id]/suspend/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { suspendUserSchema } from '@/types/api';
import { serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/users/[id]/suspend
 * Suspend a user for a specified duration
 * Only admins and moderators can suspend users
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'suspend_user',
            resource: { type: 'user', id, collection: 'users' },
            bodySchema: suspendUserSchema,
            handler: async ({ uid, body }) => {
                const { reason, durationDays } = body;

                const docRef = db.collection('users').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('User');
                }

                const userData = doc.data();
                if (userData?.isDeleted) {
                    return ApiResponse.notFound('User');
                }

                if (userData?.isBanned) {
                    return ApiResponse.badRequest('User is banned, cannot suspend');
                }

                // Prevent suspending self
                if (id === uid) {
                    return ApiResponse.forbidden('You cannot suspend yourself');
                }

                // Prevent suspending admins
                if (userData?.role === 'admin' || userData?.role === 'super_admin') {
                    return ApiResponse.forbidden('Cannot suspend administrators');
                }

                // Calculate suspension end date
                const suspendedUntil = new Date();
                suspendedUntil.setDate(suspendedUntil.getDate() + durationDays);

                await docRef.update({
                    isSuspended: true,
                    suspendedUntil: suspendedUntil.toISOString(),
                    suspendedReason: reason,
                    suspendedBy: uid,
                    updatedAt: serverTimestamp(),
                });

                return ApiResponse.success({
                    message: 'User suspended successfully',
                    id,
                    suspendedUntil: suspendedUntil.toISOString(),
                });
            },
        },
        { id }
    );
}

/**
 * DELETE /api/users/[id]/suspend
 * Remove suspension from a user
 * Only admins can unsuspend users
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'unsuspend_user',
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

                if (!userData?.isSuspended) {
                    return ApiResponse.badRequest('User is not suspended');
                }

                await docRef.update({
                    isSuspended: false,
                    suspendedUntil: null,
                    suspendedReason: null,
                    suspendedBy: null,
                    updatedAt: serverTimestamp(),
                });

                return ApiResponse.success({
                    message: 'User suspension removed successfully',
                    id,
                });
            },
        },
        { id }
    );
}
