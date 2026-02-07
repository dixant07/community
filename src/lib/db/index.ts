// src/lib/db/index.ts

export {
    batchGet,
    batchGetByIds,
    batchGetMultiple,
    batchWrite,
    withTransaction,
    serverTimestamp,
    increment,
    decrement,
    arrayUnion,
    arrayRemove,
    deleteField,
    docRef,
    generateId,
} from './batch';

export type {
    BatchOperation,
    BatchGetResult,
} from './batch';
