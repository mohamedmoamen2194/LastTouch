import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { fail, HttpStatus } from "@/lib/response";
import { ZodError } from "zod";

/**
 * Wraps an async route handler so thrown AppError/ZodError are translated
 * into the standardized ApiResult envelope with the correct status code.
 * Never leaks stack traces or internal details.
 */
export function withApi(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  return handler().catch((err) => {
    if (err instanceof AppError) {
      const fieldErrors = Array.isArray(err.details?.errors) ? err.details.errors as Array<{ path: string; message: string }> : undefined;
      return NextResponse.json(fail(err.message, fieldErrors), { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        fail("Invalid request", err.errors.map((e) => ({ path: e.path.join("."), message: e.message }))),
        { status: HttpStatus.BadRequest }
      );
    }
    console.error("[api] unhandled error", err);
    return NextResponse.json(fail("Internal server error"), { status: HttpStatus.InternalServerError });
  });
}

/** Parse a JSON request body safely, throwing 400 on invalid JSON. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("Invalid JSON body", "invalid_json", HttpStatus.BadRequest);
  }
}