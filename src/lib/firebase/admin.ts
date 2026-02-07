// src/lib/firebase/admin.ts

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App;
let adminAuth: Auth;
let adminDb: Firestore;

/**
 * Initialize Firebase Admin SDK
 * Uses service account credentials from environment variable
 */
function initializeFirebaseAdmin(): App {
    const apps = getApps();

    if (apps.length > 0) {
        return apps[0];
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!serviceAccountJson) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
    }

    let serviceAccount: object;
    try {
        serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
    }

    const app = initializeApp({
        credential: cert(serviceAccount as Parameters<typeof cert>[0]),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });

    // Configure Firestore settings
    const db = getFirestore(app);
    db.settings({
        ignoreUndefinedProperties: true,
    });

    return app;
}

/**
 * Get Firebase Admin App instance
 */
export function getAdminApp(): App {
    if (!adminApp) {
        adminApp = initializeFirebaseAdmin();
    }
    return adminApp;
}

/**
 * Get Firebase Admin Auth instance
 */
export function getAdminAuth(): Auth {
    if (!adminAuth) {
        adminAuth = getAuth(getAdminApp());
    }
    return adminAuth;
}

/**
 * Get Firebase Admin Firestore instance
 */
export function getAdminDb(): Firestore {
    if (!adminDb) {
        adminDb = getFirestore(getAdminApp());
    }
    return adminDb;
}

// Export singleton instances
export { adminApp, adminAuth, adminDb };

// Initialize on module load
try {
    adminApp = getAdminApp();
    adminAuth = getAdminAuth();
    adminDb = getAdminDb();
} catch (error) {
    console.warn('Firebase Admin initialization deferred:', error);
}
