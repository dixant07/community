// src/lib/opa/index.ts

export {
    authorize,
    authorizeBatch,
    authorizeAll,
    authorizeAny,
    verifyAndAuthorize,
    getClientIp,
} from './authorize';

export type {
    AuthResult,
    BatchAuthRequest,
    BatchAuthResult,
} from './authorize';
