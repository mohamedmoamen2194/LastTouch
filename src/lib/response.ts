/**
 * Standardized API response envelope (spec section 36).
 * Every endpoint returns the same structure.
 */
export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export type ApiFailure = {
  success: false;
  message: string;
  errors?: Array<{ path: string; message: string }>;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, message = "OK"): ApiSuccess<T> {
  return { success: true, message, data };
}

export function fail(
  message: string,
  errors?: Array<{ path: string; message: string }>
): ApiFailure {
  return { success: false, message, ...(errors ? { errors } : {}) };
}

/** Standard HTTP status codes used across the platform. */
export const HttpStatus = {
  Ok: 200,
  Created: 201,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  TooManyRequests: 429,
  InternalServerError: 500,
} as const;