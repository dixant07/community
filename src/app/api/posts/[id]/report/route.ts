// src/app/api/posts/[id]/report/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { reportSchema } from '@/types/api';
import { DEFAULT_REPORT } from '@/types/models';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/posts/[id]/report
 * Report a post for policy violations
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const { id: postId } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'report_post',
            resource: { type: 'post', id: postId, collection: 'posts' },
            bodySchema: reportSchema,
            handler: async ({ uid, body }) => {
                const { reason, description } = body;

                // Check if post exists
                const postDoc = await db.collection('posts').doc(postId).get();
                if (!postDoc.exists || postDoc.data()?.isDeleted) {
                    return ApiResponse.notFound('Post');
                }

                const postData = postDoc.data();

                // Cannot report your own post
                if (postData?.authorId === uid) {
                    return ApiResponse.badRequest('You cannot report your own post');
                }

                // Check for duplicate report in last 24 hours
                const oneDayAgo = new Date();
                oneDayAgo.setDate(oneDayAgo.getDate() - 1);

                const existingReport = await db
                    .collection('reports')
                    .where('reporterId', '==', uid)
                    .where('targetId', '==', postId)
                    .where('targetType', '==', 'post')
                    .where('createdAt', '>=', oneDayAgo.toISOString())
                    .limit(1)
                    .get();

                if (!existingReport.empty) {
                    return ApiResponse.conflict('You have already reported this post recently');
                }

                // Create report
                const reportRef = db.collection('reports').doc();
                const reportData = {
                    ...DEFAULT_REPORT,
                    id: reportRef.id,
                    reporterId: uid,
                    targetId: postId,
                    targetType: 'post' as const,
                    reason,
                    description: description || null,
                    communityId: postData?.communityId || null,
                    createdAt: new Date().toISOString(),
                };

                await reportRef.set(reportData);

                return ApiResponse.created({
                    message: 'Report submitted successfully',
                    reportId: reportRef.id,
                });
            },
        },
        { id: postId }
    );
}
