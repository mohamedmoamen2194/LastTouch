/**
 * Domain error hierarchy. Business modules throw these; route handlers
 * translate them into standardized API responses. Never expose stack traces.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", code = "not_found") {
    super(message, code, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "conflict") {
    super(message, code, 409);
    this.name = "ConflictError";
  }
}

export class ValidationAppError extends AppError {
  constructor(message: string, errors?: Array<{ path: string; message: string }>) {
    super(message, "validation_error", 400, { errors });
    this.name = "ValidationAppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, "unauthorized", 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, "forbidden", 403);
    this.name = "ForbiddenError";
  }
}

export class FeatureDisabledError extends ForbiddenError {
  constructor(feature: string) {
    super(`Feature "${feature}" is not enabled for this subscription`);
    (this as { code: string }).code = "feature_disabled";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, "rate_limited", 429);
    this.name = "RateLimitError";
  }
}