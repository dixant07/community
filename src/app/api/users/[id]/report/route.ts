// src/app/api/users/[id]/report/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { reportSchema } from '@/types/api';
import { DEFAULT_REPORT } from '@/types/models';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/users/[id]/report
 * Report a user for policy violations
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id: targetUserId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'report_user',
            resource: { type: 'user', id: targetUserId, collection: 'users' },
            bodySchema: reportSchema,
            handler: async ({ uid, body }) => {
                const { reason, description } = body;

                // Cannot report yourself
                if (targetUserId === uid) {
                    return ApiResponse.badRequest('You cannot report yourself');
                }

                // Check if target user exists
                const targetDoc = await db.collection('users').doc(targetUserId).get();
                if (!targetDoc.exists || targetDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('User');
                }

                // Check for duplicate report in last 24 hours
                const oneDayAgo = new Date();
                oneDayAgo.setDate(oneDayAgo.getDate() - 1);

                const existingReport = await db
                    .collection('reports')
                    .where('reporterId', '==', uid)
                    .where('targetId', '==', targetUserId)
                    .where('targetType', '==', 'user')
                    .where('createdAt', '>=', oneDayAgo.toISOString())
                    .limit(1)
                    .get();

                if (!existingReport.empty) {
                    return ApiResponse.conflict('You have already reported this user recently');
                }

                // Create report
                const reportRef = db.collection('reports').doc();
                const reportData = {
                    ...DEFAULT_REPORT,
                    id: reportRef.id,
                    reporterId: uid,
                    targetId: targetUserId,
                    targetType: 'user' as const,
                    reason,
                    description: description || null,
                    createdAt: new Date().toISOString(),
                };

                await reportRef.set(reportData);

                return ApiResponse.created({
                    message: 'Report submitted successfully',
                    reportId: reportRef.id,
                });
            },
        },
        { id: targetUserId }
    );
}
