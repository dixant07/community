// src/lib/db/batch.ts

import { getAdminDb } from '@/lib/firebase/admin';
import { FieldValue, DocumentReference, WriteBatch, Transaction, Firestore } from 'firebase-admin/firestore';

/**
 * Batch operation types
 */
export type BatchOperation =
    | { type: 'set'; ref: DocumentReference; data: Record<string, unknown>; merge?: boolean }
    | { type: 'update'; ref: DocumentReference; data: Record<string, unknown> }
    | { type: 'delete'; ref: DocumentReference };

/**
 * Result of a batch get operation
 */
export interface BatchGetResult<T> {
    id: string;
    exists: boolean;
    data: T | null;
}

/**
 * Get Firestore instance
 */
function getDb(): Firestore {
    return getAdminDb();
}

/**
 * Batch get multiple documents
 * More efficient than individual reads
 */
export async function batchGet<T = Record<string, unknown>>(
    refs: DocumentReference[]
): Promise<BatchGetResult<T>[]> {
    if (refs.length === 0) return [];

    const db = getDb();
    const snapshots = await db.getAll(...refs);

    return snapshots.map((snap) => ({
        id: snap.id,
        exists: snap.exists,
        data: snap.exists ? (snap.data() as T) : null,
    }));
}

/**
 * Batch get documents by IDs from a collection
 */
export async function batchGetByIds<T = Record<string, unknown>>(
    collection: string,
    ids: string[]
): Promise<BatchGetResult<T>[]> {
    if (ids.length === 0) return [];

    const db = getDb();
    const refs = ids.map((id) => db.collection(collection).doc(id));
    return batchGet<T>(refs);
}

/**
 * Batch get documents from multiple collections
 */
export async function batchGetMultiple<T = Record<string, unknown>>(
    requests: Array<{ collection: string; id: string }>
): Promise<BatchGetResult<T>[]> {
    if (requests.length === 0) return [];

    const db = getDb();
    const refs = requests.map(({ collection, id }) => db.collection(collection).doc(id));
    return batchGet<T>(refs);
}

/**
 * Batch write multiple operations
 * Supports set, update, and delete operations
 * Firestore limits: 500 operations per batch
 */
export async function batchWrite(operations: BatchOperation[]): Promise<void> {
    if (operations.length === 0) return;

    const db = getDb();

    // Split into chunks of 500 (Firestore limit)
    const chunks: BatchOperation[][] = [];
    for (let i = 0; i < operations.length; i += 500) {
        chunks.push(operations.slice(i, i + 500));
    }

    // Execute each chunk
    for (const chunk of chunks) {
        const batch: WriteBatch = db.batch();

        for (const op of chunk) {
            switch (op.type) {
                case 'set':
                    batch.set(op.ref, op.data, { merge: op.merge ?? false });
                    break;
                case 'update':
                    batch.update(op.ref, op.data);
                    break;
                case 'delete':
                    batch.delete(op.ref);
                    break;
            }
        }

        await batch.commit();
    }
}

/**
 * Execute operations within a transaction
 * Use for operations that require atomicity and consistency
 */
export async function withTransaction<T>(
    callback: (transaction: Transaction) => Promise<T>
): Promise<T> {
    const db = getDb();
    return db.runTransaction(callback);
}

/**
 * Helper to create a server timestamp
 */
export function serverTimestamp(): FieldValue {
    return FieldValue.serverTimestamp();
}

/**
 * Helper to increment a field
 */
export function increment(value: number = 1): FieldValue {
    return FieldValue.increment(value);
}

/**
 * Helper to decrement a field
 */
export function decrement(value: number = 1): FieldValue {
    return FieldValue.increment(-value);
}

/**
 * Helper to add to an array field
 */
export function arrayUnion(...elements: unknown[]): FieldValue {
    return FieldValue.arrayUnion(...elements);
}

/**
 * Helper to remove from an array field
 */
export function arrayRemove(...elements: unknown[]): FieldValue {
    return FieldValue.arrayRemove(...elements);
}

/**
 * Delete a field
 */
export function deleteField(): FieldValue {
    return FieldValue.delete();
}

/**
 * Create a document reference
 */
export function docRef(collection: string, id: string): DocumentReference {
    const db = getDb();
    return db.collection(collection).doc(id);
}

/**
 * Generate a new document ID
 */
export function generateId(collection: string): string {
    const db = getDb();
    return db.collection(collection).doc().id;
}
