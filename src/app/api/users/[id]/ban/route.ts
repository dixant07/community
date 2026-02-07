// src/app/api/users/[id]/ban/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { banUserSchema } from '@/types/api';
import { serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/users/[id]/ban
 * Ban a user
 * Only admins and moderators can ban users
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'ban_user',
            resource: { type: 'user', id, collection: 'users' },
            bodySchema: banUserSchema,
            handler: async ({ uid, body }) => {
                const { reason } = body;

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
                    return ApiResponse.conflict('User is already banned');
                }

                // Prevent banning self
                if (id === uid) {
                    return ApiResponse.forbidden('You cannot ban yourself');
                }

                // Prevent banning admins
                if (userData?.role === 'admin' || userData?.role === 'super_admin') {
                    return ApiResponse.forbidden('Cannot ban administrators');
                }

                await docRef.update({
                    isBanned: true,
                    bannedAt: new Date().toISOString(),
                    bannedReason: reason,
                    bannedBy: uid,
                    updatedAt: serverTimestamp(),
                });

                return ApiResponse.success({
                    message: 'User banned successfully',
                    id,
                });
            },
        },
        { id }
    );
}

/**
 * DELETE /api/users/[id]/ban
 * Unban a user
 * Only admins can unban users
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'unban_user',
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

                if (!userData?.isBanned) {
                    return ApiResponse.badRequest('User is not banned');
                }

                await docRef.update({
                    isBanned: false,
                    bannedAt: null,
                    bannedReason: null,
                    bannedBy: null,
                    updatedAt: serverTimestamp(),
                });

                return ApiResponse.success({
                    message: 'User unbanned successfully',
                    id,
                });
            },
        },
        { id }
    );
}
