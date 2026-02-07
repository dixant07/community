// src/app/api/search/route.ts

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { withAuth, parsePagination, ApiResponse } from '@/lib/api';

/**
 * GET /api/search
 * Search posts, users, and communities
 * 
 * Note: This is a basic implementation using Firestore prefix matching.
 * For production, consider integrating with:
 * - Typesense
 * - Meilisearch
 * - Algolia
 * - Elasticsearch
 */
export async function GET(req: NextRequest) {
    const db = getAdminDb();

    return withAuth(req, {
        action: 'search',
        resource: { type: 'search', collection: 'search' },
        handler: async ({ query }) => {
            const { limit } = parsePagination(query);
            const searchQuery = query.get('q')?.toLowerCase() || '';
            const searchType = query.get('type') || 'all'; // all, posts, users, communities

            if (!searchQuery || searchQuery.length < 2) {
                return ApiResponse.badRequest('Search query must be at least 2 characters');
            }

            const results: {
                posts: unknown[];
                users: unknown[];
                communities: unknown[];
            } = {
                posts: [],
                users: [],
                communities: [],
            };

            const searchLimit = Math.min(limit, 10); // Limit per type

            // Search communities by name/slug (prefix search)
            if (searchType === 'all' || searchType === 'communities') {
                const communitiesSnapshot = await db
                    .collection('communities')
                    .where('isDeleted', '!=', true)
                    .where('slug', '>=', searchQuery)
                    .where('slug', '<=', searchQuery + '\uf8ff')
                    .limit(searchLimit)
                    .get();

                results.communities = communitiesSnapshot.docs.map((doc) => ({
                    id: doc.id,
                    type: 'community',
                    name: doc.data().name,
                    slug: doc.data().slug,
                    description: doc.data().description,
                    memberCount: doc.data().memberCount,
                    icon: doc.data().icon,
                }));
            }

            // Search users by username (prefix search)
            if (searchType === 'all' || searchType === 'users') {
                const usersSnapshot = await db
                    .collection('users')
                    .where('isDeleted', '!=', true)
                    .where('username', '>=', searchQuery)
                    .where('username', '<=', searchQuery + '\uf8ff')
                    .limit(searchLimit)
                    .get();

                results.users = usersSnapshot.docs.map((doc) => ({
                    id: doc.id,
                    type: 'user',
                    username: doc.data().username,
                    displayName: doc.data().displayName,
                    photoURL: doc.data().photoURL,
                    karma: doc.data().karma,
                }));
            }

            // Search posts by title (prefix search)
            // Note: Full-text search on content requires external service
            if (searchType === 'all' || searchType === 'posts') {
                const postsSnapshot = await db
                    .collection('posts')
                    .where('isDeleted', '!=', true)
                    .orderBy('createdAt', 'desc')
                    .limit(searchLimit * 5) // Get more to filter
                    .get();

                // Filter posts whose title contains the search query
                // This is inefficient - use external search service in production
                const matchingPosts = postsSnapshot.docs
                    .filter((doc) => {
                        const title = (doc.data().title || '').toLowerCase();
                        return title.includes(searchQuery);
                    })
                    .slice(0, searchLimit);

                results.posts = matchingPosts.map((doc) => ({
                    id: doc.id,
                    type: 'post',
                    title: doc.data().title,
                    authorId: doc.data().authorId,
                    communityId: doc.data().communityId,
                    score: doc.data().metrics?.score || 0,
                    commentCount: doc.data().metrics?.commentCount || 0,
                    createdAt: doc.data().createdAt,
                }));
            }

            return ApiResponse.success({
                query: searchQuery,
                type: searchType,
                results,
                counts: {
                    posts: results.posts.length,
                    users: results.users.length,
                    communities: results.communities.length,
                    total:
                        results.posts.length +
                        results.users.length +
                        results.communities.length,
                },
            });
        },
    });
}
