// src/app/api/admin/reports/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';
import { batchGetByIds } from '@/lib/db';
import { Query, DocumentData } from 'firebase-admin/firestore';

/**
 * GET /api/admin/reports
 * List reports for admin review
 * Only accessible by admins
 */
export async function GET(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'list_reports',
        resource: { type: 'report', collection: 'reports' },
        handler: async ({ query }) => {
            const { limit, cursor, sortBy, sortOrder } = parsePagination(query);
            const status = query.get('status') || 'pending'; // pending, reviewed, resolved, dismissed
            const targetType = query.get('targetType'); // user, post, comment, community

            let reportsQuery: Query<DocumentData, DocumentData> = db.collection('reports');

            // Filter by status
            if (status !== 'all') {
                reportsQuery = reportsQuery.where('status', '==', status);
            }

            // Filter by target type
            if (targetType) {
                reportsQuery = reportsQuery.where('targetType', '==', targetType);
            }

            const orderField = sortBy === 'priority' ? 'priority' : 'createdAt';
            reportsQuery = reportsQuery
                .orderBy(orderField, sortOrder || 'desc')
                .limit(limit + 1);

            if (cursor) {
                const cursorDoc = await db.collection('reports').doc(cursor).get();
                if (cursorDoc.exists) {
                    reportsQuery = reportsQuery.startAfter(cursorDoc);
                }
            }

            const snapshot = await reportsQuery.get();
            const docs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;

            // Get reporter info
            const reporterIds = [...new Set(docs.map((doc) => doc.data().reporterId))];
            const reporters = await batchGetByIds('users', reporterIds);
            const reportersMap = new Map(
                reporters.filter((r) => r.exists).map((r) => [r.id, r.data])
            );

            // Get resolver info if any
            const resolverIds = [
                ...new Set(docs.map((doc) => doc.data().resolvedBy).filter(Boolean)),
            ];
            const resolvers = await batchGetByIds('users', resolverIds as string[]);
            const resolversMap = new Map(
                resolvers.filter((r) => r.exists).map((r) => [r.id, r.data])
            );

            const reports = docs.map((doc) => {
                const data = doc.data();
                const reporterData = reportersMap.get(data.reporterId);
                const resolverData = data.resolvedBy
                    ? resolversMap.get(data.resolvedBy)
                    : null;

                return {
                    id: doc.id,
                    ...data,
                    reporter: reporterData
                        ? {
                            id: data.reporterId,
                            username: reporterData.username,
                            displayName: reporterData.displayName,
                        }
                        : null,
                    resolver: resolverData
                        ? {
                            id: data.resolvedBy,
                            username: resolverData.username,
                            displayName: resolverData.displayName,
                        }
                        : null,
                };
            });

            // Get report counts by status
            const pendingCount = await db
                .collection('reports')
                .where('status', '==', 'pending')
                .count()
                .get();

            const nextCursor =
                hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined;

            return ApiResponse.paginated(reports, {
                page: 1,
                limit,
                hasMore,
                nextCursor,
                meta: {
                    pendingCount: pendingCount.data().count,
                },
            });
        },
    });
}
