// src/lib/api/index.ts

export {
    withAuth,
    withoutAuth,
    extractToken,
    extractParams,
    parsePagination,
    paginationSchema,
} from './base';

export type {
    AuthContext,
    HandlerContext,
    HandlerOptions,
    PaginationParams,
} from './base';

export { ApiResponse } from './response';

export type {
    PaginationMeta,
    ApiSuccessResponse,
    ApiErrorResponseType,
    ApiPaginatedResponse,
} from './response';

export {
    ApiError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    GoneError,
    UnprocessableError,
    RateLimitError,
    InternalError,
    ServiceUnavailableError,
} from './errors';
