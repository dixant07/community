// src/app/api/communities/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';
import { createCommunitySchema } from '@/types/api';
import { DEFAULT_COMMUNITY, DEFAULT_MEMBERSHIP, getMembershipId } from '@/types/models';
import { serverTimestamp } from '@/lib/db';

/**
 * GET /api/communities
 * List communities with pagination
 */
export async function GET(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'list_communities',
        resource: { type: 'community', collection: 'communities' },
        handler: async ({ query }) => {
            const { limit, cursor, sortBy, sortOrder } = parsePagination(query);
            const search = query.get('search');

            let dbQuery = db
                .collection('communities')
                .where('isDeleted', '!=', true);

            // Search by name/slug if provided
            // Note: Firestore doesn't support full-text search, 
            // consider Algolia/Typesense for production
            if (search) {
                // Simple prefix search on slug
                dbQuery = dbQuery
                    .where('slug', '>=', search.toLowerCase())
                    .where('slug', '<=', search.toLowerCase() + '\uf8ff');
            }

            const orderByField = sortBy === 'members' ? 'memberCount' : 'createdAt';
            dbQuery = dbQuery.orderBy(orderByField, sortOrder || 'desc').limit(limit + 1);

            if (cursor) {
                const cursorDoc = await db.collection('communities').doc(cursor).get();
                if (cursorDoc.exists) {
                    dbQuery = dbQuery.startAfter(cursorDoc);
                }
            }

            const snapshot = await dbQuery.get();
            const docs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;

            const communities = docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));

            const nextCursor =
                hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined;

            return ApiResponse.paginated(communities, {
                page: 1,
                limit,
                hasMore,
                nextCursor,
            });
        },
    });
}

/**
 * POST /api/communities
 * Create a new community
 */
export async function POST(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'create_community',
        resource: { type: 'community', collection: 'communities' },
        bodySchema: createCommunitySchema,
        handler: async ({ uid, body }) => {
            const { name, slug, description, visibility, isNsfw, rules } = body;

            // Check if slug is taken
            const slugLower = slug.toLowerCase();
            const existingSlug = await db
                .collection('communities')
                .where('slug', '==', slugLower)
                .limit(1)
                .get();

            if (!existingSlug.empty) {
                return ApiResponse.conflict('Community slug already taken');
            }

            const communityRef = db.collection('communities').doc();
            const now = new Date().toISOString();

            // Create rules with IDs
            const rulesWithIds = (rules || []).map((rule, index) => ({
                id: `rule_${index + 1}`,
                title: rule.title,
                description: rule.description,
                order: index,
            }));

            const communityData = {
                ...DEFAULT_COMMUNITY,
                id: communityRef.id,
                name,
                slug: slugLower,
                description: description || null,
                ownerId: uid,
                visibility: visibility || 'public',
                isNsfw: isNsfw || false,
                rules: rulesWithIds,
                moderatorIds: [uid], // Owner is first moderator
                createdAt: now,
            };

            const batch = db.batch();

            // Create community
            batch.set(communityRef, communityData);

            // Create owner membership
            const membershipId = getMembershipId(communityRef.id, uid);
            batch.set(db.collection('memberships').doc(membershipId), {
                ...DEFAULT_MEMBERSHIP,
                id: membershipId,
                communityId: communityRef.id,
                userId: uid,
                role: 'owner',
                joinedAt: now,
            });

            await batch.commit();

            return ApiResponse.created(communityData);
        },
    });
}
