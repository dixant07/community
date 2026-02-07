// src/app/api/users/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';
import { createUserSchema } from '@/types/api';
import { DEFAULT_USER } from '@/types/models';
import { serverTimestamp } from '@/lib/db';

/**
 * GET /api/users
 * List users with pagination
 * Requires authentication and list_users permission
 */
export async function GET(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'list_users',
        resource: { type: 'user', collection: 'users' },
        handler: async ({ query }) => {
            const { limit, cursor, sortBy, sortOrder } = parsePagination(query);

            // Build query
            let dbQuery = db
                .collection('users')
                .where('isDeleted', '!=', true)
                .orderBy(sortBy || 'createdAt', sortOrder || 'desc')
                .limit(limit + 1);

            // Handle cursor pagination
            if (cursor) {
                const cursorDoc = await db.collection('users').doc(cursor).get();
                if (cursorDoc.exists) {
                    dbQuery = dbQuery.startAfter(cursorDoc);
                }
            }

            const snapshot = await dbQuery.get();
            const docs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;

            const users = docs.map((doc) => {
                const data = doc.data();
                // Remove sensitive fields
                const { bannedReason, suspendedReason, ...publicData } = data;
                return {
                    id: doc.id,
                    ...publicData,
                };
            });

            const nextCursor =
                hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined;

            return ApiResponse.paginated(users, {
                page: 1,
                limit,
                hasMore,
                nextCursor,
            });
        },
    });
}

/**
 * POST /api/users
 * Create a new user
 * Requires authentication and create_user permission
 */
export async function POST(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'create_user',
        resource: { type: 'user', collection: 'users' },
        bodySchema: createUserSchema,
        handler: async ({ uid, body }) => {
            const { email, username, displayName, dateOfBirth, bio, photoURL } = body;

            // Check if username already exists
            const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();

            if (usernameDoc.exists) {
                return ApiResponse.conflict('Username already taken');
            }

            // Check if user already exists
            const existingUser = await db.collection('users').doc(uid).get();
            if (existingUser.exists) {
                return ApiResponse.conflict('User already exists');
            }

            const now = new Date().toISOString();

            // Use batch write for atomicity
            const batch = db.batch();

            // Create username mapping (lowercase for case-insensitive lookup)
            batch.set(db.collection('usernames').doc(username.toLowerCase()), {
                username: username,
                email,
                uid,
                createdAt: serverTimestamp(),
            });

            // Create user document
            const userData = {
                ...DEFAULT_USER,
                email,
                username,
                displayName: displayName || username,
                dateOfBirth: dateOfBirth || null,
                bio: bio || null,
                photoURL: photoURL || null,
                createdAt: now,
            };

            batch.set(db.collection('users').doc(uid), userData);

            await batch.commit();

            return ApiResponse.created({
                id: uid,
                ...userData,
            });
        },
    });
}
