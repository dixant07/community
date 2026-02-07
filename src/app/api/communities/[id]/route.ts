// src/app/api/communities/[id]/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, ApiResponse } from '@/lib/api';
import { updateCommunitySchema } from '@/types/api';
import { getMembershipId } from '@/types/models';
import { serverTimestamp } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/communities/[id]
 * Get a community by ID or slug
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'read_community',
            resource: { type: 'community', id, collection: 'communities' },
            handler: async ({ uid }) => {
                // Try to find by ID first, then by slug
                let doc = await db.collection('communities').doc(id).get();

                if (!doc.exists) {
                    // Try by slug
                    const slugQuery = await db
                        .collection('communities')
                        .where('slug', '==', id.toLowerCase())
                        .limit(1)
                        .get();

                    if (slugQuery.empty) {
                        return ApiResponse.notFound('Community');
                    }

                    doc = slugQuery.docs[0];
                }

                const communityData = doc.data();

                if (communityData?.isDeleted) {
                    return ApiResponse.notFound('Community');
                }

                // Get owner info
                const ownerDoc = await db
                    .collection('users')
                    .doc(communityData?.ownerId)
                    .get();
                const ownerData = ownerDoc.exists ? ownerDoc.data() : null;

                // Check if current user is a member
                let membership = null;
                if (uid) {
                    const membershipId = getMembershipId(doc.id, uid);
                    const membershipDoc = await db
                        .collection('memberships')
                        .doc(membershipId)
                        .get();
                    if (membershipDoc.exists) {
                        membership = membershipDoc.data();
                    }
                }

                return ApiResponse.success({
                    id: doc.id,
                    ...communityData,
                    owner: ownerData
                        ? {
                            id: ownerDoc.id,
                            username: ownerData.username,
                            displayName: ownerData.displayName,
                            photoURL: ownerData.photoURL,
                        }
                        : null,
                    membership,
                });
            },
        },
        { id }
    );
}

/**
 * PATCH /api/communities/[id]
 * Update a community
 * Only owner or admins can update
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'update_community',
            resource: async ({ params }) => {
                const communityDoc = await db.collection('communities').doc(params.id).get();
                return {
                    type: 'community',
                    id: params.id,
                    collection: 'communities',
                    data: communityDoc.data(),
                };
            },
            bodySchema: updateCommunitySchema,
            handler: async ({ uid, body }) => {
                const docRef = db.collection('communities').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('Community');
                }

                const communityData = doc.data();

                if (communityData?.isDeleted) {
                    return ApiResponse.notFound('Community');
                }

                // Check if user is owner or admin
                const membershipId = getMembershipId(id, uid);
                const membershipDoc = await db
                    .collection('memberships')
                    .doc(membershipId)
                    .get();

                if (!membershipDoc.exists) {
                    return ApiResponse.forbidden('You are not a member of this community');
                }

                const memberRole = membershipDoc.data()?.role;
                if (!['owner', 'admin'].includes(memberRole)) {
                    return ApiResponse.forbidden('You do not have permission to update this community');
                }

                // Process rules if provided
                let rulesUpdate = undefined;
                if (body.rules) {
                    rulesUpdate = body.rules.map((rule, index) => ({
                        id: rule.id || `rule_${Date.now()}_${index}`,
                        title: rule.title,
                        description: rule.description,
                        order: rule.order ?? index,
                    }));
                }

                const updateData = {
                    ...body,
                    ...(rulesUpdate && { rules: rulesUpdate }),
                    updatedAt: serverTimestamp(),
                };

                await docRef.update(updateData);

                const updatedDoc = await docRef.get();

                return ApiResponse.success({
                    id: updatedDoc.id,
                    ...updatedDoc.data(),
                });
            },
        },
        { id }
    );
}

/**
 * DELETE /api/communities/[id]
 * Delete a community (soft delete)
 * Only owner can delete
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id } = await params;
    const db = getAdminDb();

    return withAuth(
        req,
        {
            action: 'delete_community',
            resource: async ({ params }) => {
                const communityDoc = await db.collection('communities').doc(params.id).get();
                return {
                    type: 'community',
                    id: params.id,
                    collection: 'communities',
                    data: communityDoc.data(),
                };
            },
            handler: async ({ uid }) => {
                const docRef = db.collection('communities').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return ApiResponse.notFound('Community');
                }

                const communityData = doc.data();

                if (communityData?.isDeleted) {
                    return ApiResponse.notFound('Community');
                }

                // Only owner can delete
                if (communityData?.ownerId !== uid) {
                    return ApiResponse.forbidden('Only the owner can delete this community');
                }

                await docRef.update({
                    isDeleted: true,
                    deletedAt: new Date().toISOString(),
                    deletedBy: uid,
                });

                return ApiResponse.success({
                    message: 'Community deleted successfully',
                    id,
                });
            },
        },
        { id }
    );
}
