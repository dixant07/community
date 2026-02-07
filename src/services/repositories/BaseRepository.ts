// src/services/repositories/BaseRepository.ts

import { getAdminDb } from '@/lib/firebase/admin';
import {
    batchGet,
    batchGetByIds,
    batchWrite,
    serverTimestamp,
    increment,
    decrement,
    type BatchOperation,
    type BatchGetResult,
} from '@/lib/db/batch';
import { Firestore, DocumentSnapshot, Query, OrderByDirection } from 'firebase-admin/firestore';

/**
 * Base entity interface - all models must have these
 */
export interface BaseEntity {
    id: string;
    createdAt: string;
    updatedAt?: string;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
    limit: number;
    cursor?: string;
    orderBy?: string;
    orderDirection?: OrderByDirection;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
    items: T[];
    hasMore: boolean;
    nextCursor?: string;
    totalCount?: number;
}

/**
 * Query filter
 */
export interface QueryFilter {
    field: string;
    operator: FirebaseFirestore.WhereFilterOp;
    value: unknown;
}

/**
 * Base repository class providing common CRUD operations
 * Extend this class for each entity type
 */
export abstract class BaseRepository<T extends BaseEntity> {
    protected db: Firestore;
    protected collectionName: string;

    constructor(collectionName: string) {
        this.collectionName = collectionName;
        this.db = getAdminDb();
    }

    /**
     * Get collection reference
     */
    protected get collection() {
        return this.db.collection(this.collectionName);
    }

    /**
     * Transform Firestore document to entity
     * Override in subclasses for custom transformation
     */
    protected toEntity(doc: DocumentSnapshot): T | null {
        if (!doc.exists) return null;

        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            createdAt: this.toISOString(data?.createdAt),
            updatedAt: data?.updatedAt ? this.toISOString(data.updatedAt) : undefined,
        } as T;
    }

    /**
     * Convert Firestore timestamp to ISO string
     */
    protected toISOString(timestamp: unknown): string {
        if (!timestamp) return new Date().toISOString();
        if (typeof timestamp === 'string') return timestamp;
        if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
            return (timestamp as { toDate: () => Date }).toDate().toISOString();
        }
        return new Date().toISOString();
    }

    /**
     * Find entity by ID
     */
    async findById(id: string): Promise<T | null> {
        const doc = await this.collection.doc(id).get();
        return this.toEntity(doc);
    }

    /**
     * Find multiple entities by IDs
     */
    async findByIds(ids: string[]): Promise<BatchGetResult<T>[]> {
        return batchGetByIds<T>(this.collectionName, ids);
    }

    /**
     * Find all entities with pagination
     */
    async findAll(options: PaginationOptions): Promise<PaginatedResult<T>> {
        const { limit, cursor, orderBy = 'createdAt', orderDirection = 'desc' } = options;

        let query: Query = this.collection
            .orderBy(orderBy, orderDirection)
            .limit(limit + 1);

        if (cursor) {
            const cursorDoc = await this.collection.doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        const docs = snapshot.docs.slice(0, limit);
        const hasMore = snapshot.docs.length > limit;

        const items = docs
            .map((doc) => this.toEntity(doc))
            .filter((item): item is T => item !== null);

        return {
            items,
            hasMore,
            nextCursor: hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined,
        };
    }

    /**
     * Find entities with filters
     */
    async findWhere(
        filters: QueryFilter[],
        options: PaginationOptions
    ): Promise<PaginatedResult<T>> {
        const { limit, cursor, orderBy = 'createdAt', orderDirection = 'desc' } = options;

        let query: Query = this.collection;

        // Apply filters
        for (const filter of filters) {
            query = query.where(filter.field, filter.operator, filter.value);
        }

        query = query.orderBy(orderBy, orderDirection).limit(limit + 1);

        if (cursor) {
            const cursorDoc = await this.collection.doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        const docs = snapshot.docs.slice(0, limit);
        const hasMore = snapshot.docs.length > limit;

        const items = docs
            .map((doc) => this.toEntity(doc))
            .filter((item): item is T => item !== null);

        return {
            items,
            hasMore,
            nextCursor: hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined,
        };
    }

    /**
     * Create a new entity
     */
    async create(id: string, data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
        const now = new Date().toISOString();
        const entityData = {
            ...data,
            createdAt: now,
        };

        await this.collection.doc(id).set(entityData);

        return {
            id,
            ...entityData,
        } as T;
    }

    /**
     * Create with auto-generated ID
     */
    async createWithAutoId(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
        const docRef = this.collection.doc();
        return this.create(docRef.id, data);
    }

    /**
     * Update an entity
     */
    async update(id: string, data: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T | null> {
        const docRef = this.collection.doc(id);
        const doc = await docRef.get();

        if (!doc.exists) return null;

        const updateData = {
            ...data,
            updatedAt: serverTimestamp(),
        };

        await docRef.update(updateData);

        // Fetch updated document
        const updatedDoc = await docRef.get();
        return this.toEntity(updatedDoc);
    }

    /**
     * Delete an entity
     */
    async delete(id: string): Promise<boolean> {
        const docRef = this.collection.doc(id);
        const doc = await docRef.get();

        if (!doc.exists) return false;

        await docRef.delete();
        return true;
    }

    /**
     * Soft delete an entity
     */
    async softDelete(id: string): Promise<T | null> {
        return this.update(id, {
            isDeleted: true,
            deletedAt: new Date().toISOString(),
        } as unknown as Partial<Omit<T, 'id' | 'createdAt'>>);
    }

    /**
     * Check if entity exists
     */
    async exists(id: string): Promise<boolean> {
        const doc = await this.collection.doc(id).get();
        return doc.exists;
    }

    /**
     * Count documents (with optional filter)
     */
    async count(filters?: QueryFilter[]): Promise<number> {
        let query: Query = this.collection;

        if (filters) {
            for (const filter of filters) {
                query = query.where(filter.field, filter.operator, filter.value);
            }
        }

        const snapshot = await query.count().get();
        return snapshot.data().count;
    }

    /**
     * Increment a numeric field
     */
    async incrementField(id: string, field: string, value: number = 1): Promise<void> {
        const docRef = this.collection.doc(id);
        await docRef.update({
            [field]: value > 0 ? increment(value) : decrement(Math.abs(value)),
            updatedAt: serverTimestamp(),
        });
    }

    /**
     * Batch create multiple entities
     */
    async batchCreate(
        entities: Array<{ id: string; data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> }>
    ): Promise<void> {
        const now = new Date().toISOString();
        const operations: BatchOperation[] = entities.map(({ id, data }) => ({
            type: 'set' as const,
            ref: this.collection.doc(id),
            data: { ...data, createdAt: now },
        }));

        await batchWrite(operations);
    }

    /**
     * Batch update multiple entities
     */
    async batchUpdate(
        updates: Array<{ id: string; data: Partial<Omit<T, 'id' | 'createdAt'>> }>
    ): Promise<void> {
        const operations: BatchOperation[] = updates.map(({ id, data }) => ({
            type: 'update' as const,
            ref: this.collection.doc(id),
            data: { ...data, updatedAt: serverTimestamp() },
        }));

        await batchWrite(operations);
    }

    /**
     * Batch delete multiple entities
     */
    async batchDelete(ids: string[]): Promise<void> {
        const operations: BatchOperation[] = ids.map((id) => ({
            type: 'delete' as const,
            ref: this.collection.doc(id),
        }));

        await batchWrite(operations);
    }
}
