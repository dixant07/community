// src/app/api/admin/reports/[id]/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { z } from 'zod';
import { serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

const resolveReportSchema = z.object({
    resolution: z.enum(['resolved', 'dismissed']),
    resolutionNote: z.string().optional(),
    actionTaken: z.string().optional(),
});

/**
 * GET /api/admin/reports/[id]
 * Get a specific report
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'list_reports',
            resource: { type: 'report', id, collection: 'reports' },
            handler: async () => {
                const doc = await db.collection('reports').doc(id).get();

                if (!doc.exists) {
                    return ApiResponse.notFound('Report');
                }

                const data = doc.data();

                // Get reporter info
                let reporter = null;
                if (data?.reporterId) {
                    const reporterDoc = await db
                        .collection('users')
                        .doc(data.reporterId)
                        .get();
                    if (reporterDoc.exists) {
                        const reporterData = reporterDoc.data();
                        reporter = {
                            id: reporterDoc.id,
                            username: reporterData?.username,
                            displayName: reporterData?.displayName,
                        };
                    }
                }

                // Get target content info
                let target = null;
                if (data?.targetId && data?.targetType) {
                    const collection = `${data.targetType}s`; // posts, comments, users, communities
                    const targetDoc = await db.collection(collection).doc(data.targetId).get();
                    if (targetDoc.exists) {
                        target = {
                            id: targetDoc.id,
                            ...targetDoc.data(),
                        };
                    }
                }

                return ApiResponse.success({
                    id: doc.id,
                    ...data,
                    reporter,
                    target,
                });
            },
        },
        { id }
    );
}

/**
 * PATCH /api/admin/reports/[id]
 * Resolve or dismiss a report
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'resolve_report',
            resource: { type: 'report', id, collection: 'reports' },
            bodySchema: resolveReportSchema,
            handler: async ({ uid, body }) => {
                const docRef = db.collection('reports').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('Report');
                }

                const data = doc.data();

                if (data?.status === 'resolved' || data?.status === 'dismissed') {
                    return ApiResponse.conflict('Report has already been resolved');
                }

                await docRef.update({
                    status: body.resolution,
                    resolutionNote: body.resolutionNote || null,
                    actionTaken: body.actionTaken || null,
                    resolvedBy: uid,
                    resolvedAt: new Date().toISOString(),
                    updatedAt: serverTimestamp(),
                });

                const updatedDoc = await docRef.get();

                return ApiResponse.success({
                    id: updatedDoc.id,
                    ...updatedDoc.data(),
                    message: `Report ${body.resolution}`,
                });
            },
        },
        { id }
    );
}
