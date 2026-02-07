// src/app/api/notifications/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';
import { batchGetByIds } from '@/lib/db';

/**
 * GET /api/notifications
 * Get notifications for the authenticated user
 */
export async function GET(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'read_notifications',
        resource: { type: 'notification', collection: 'notifications' },
        handler: async ({ uid, query }) => {
            const { limit, cursor } = parsePagination(query);
            const unreadOnly = query.get('unread') === 'true';

            let notificationsQuery = db
                .collection('notifications')
                .where('userId', '==', uid)
                .where('isArchived', '==', false);

            if (unreadOnly) {
                notificationsQuery = notificationsQuery.where('isRead', '==', false);
            }

            notificationsQuery = notificationsQuery
                .orderBy('createdAt', 'desc')
                .limit(limit + 1);

            if (cursor) {
                const cursorDoc = await db.collection('notifications').doc(cursor).get();
                if (cursorDoc.exists) {
                    notificationsQuery = notificationsQuery.startAfter(cursorDoc);
                }
            }

            const snapshot = await notificationsQuery.get();
            const docs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;

            // Get actor info for notifications
            const actorIds = [...new Set(
                docs.map((doc) => doc.data().actorId).filter(Boolean)
            )];
            const actors = await batchGetByIds('users', actorIds as string[]);
            const actorsMap = new Map(
                actors.filter((a) => a.exists).map((a) => [a.id, a.data])
            );

            const notifications = docs.map((doc) => {
                const data = doc.data();
                const actorData = data.actorId ? actorsMap.get(data.actorId) : null;

                return {
                    id: doc.id,
                    ...data,
                    actor: actorData
                        ? {
                            id: data.actorId,
                            username: actorData.username,
                            displayName: actorData.displayName,
                            photoURL: actorData.photoURL,
                        }
                        : null,
                };
            });

            // Get unread count
            const unreadSnapshot = await db
                .collection('notifications')
                .where('userId', '==', uid)
                .where('isRead', '==', false)
                .where('isArchived', '==', false)
                .count()
                .get();

            const unreadCount = unreadSnapshot.data().count;

            const nextCursor =
                hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined;

            return ApiResponse.paginated(notifications, {
                page: 1,
                limit,
                hasMore,
                nextCursor,
                meta: { unreadCount },
            });
        },
    });
}

/**
 * PATCH /api/notifications
 * Mark notifications as read
 */
export async function PATCH(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'read_notifications',
        resource: { type: 'notification', collection: 'notifications' },
        handler: async ({ uid, body }) => {
            const { notificationIds, markAllRead } = body as {
                notificationIds?: string[];
                markAllRead?: boolean
            };

            if (markAllRead) {
                // Mark all unread notifications as read
                const unreadSnapshot = await db
                    .collection('notifications')
                    .where('userId', '==', uid)
                    .where('isRead', '==', false)
                    .get();

                const batch = db.batch();
                unreadSnapshot.docs.forEach((doc) => {
                    batch.update(doc.ref, { isRead: true });
                });
                await batch.commit();

                return ApiResponse.success({
                    message: 'All notifications marked as read',
                    count: unreadSnapshot.docs.length,
                });
            }

            if (notificationIds && notificationIds.length > 0) {
                const batch = db.batch();

                for (const id of notificationIds) {
                    const docRef = db.collection('notifications').doc(id);
                    const doc = await docRef.get();

                    // Verify notification belongs to the user
                    if (doc.exists && doc.data()?.userId === uid) {
                        batch.update(docRef, { isRead: true });
                    }
                }

                await batch.commit();

                return ApiResponse.success({
                    message: 'Notifications marked as read',
                    count: notificationIds.length,
                });
            }

            return ApiResponse.badRequest('Provide notificationIds or set markAllRead to true');
        },
    });
}
