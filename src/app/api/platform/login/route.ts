import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  PLATFORM_COOKIE,
  getPlatformEmail,
  mintPlatformSession,
  verifyPlatformPassword,
} from "@/lib/platform/session";

const bodySchema = z.object({
  email: z.string().max(255),
  password: z.string().max(200),
});

const COOKIE_MAX_AGE = 12 * 60 * 60; // 12h, matches session TTL

/**
 * POST /api/platform/login — owner password gate. Sets an httpOnly signed
 * session cookie on success. Rate-limited per IP.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    rateLimit(`platform-login:${clientIp(req)}`, 5);
    const body = await readJson<unknown>(req);
    const input = bodySchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: HttpStatus.BadRequest });
    }

    const expectedEmail = getPlatformEmail();
    const emailOk =
      expectedEmail !== null && input.data.email.trim().toLowerCase() === expectedEmail;
    const passOk = emailOk && (await verifyPlatformPassword(input.data.password));
    if (!emailOk || !passOk) {
      // Same message either way — never reveal which field was wrong.
      return NextResponse.json(
        { success: false, message: "Wrong email or password" },
        { status: HttpStatus.Unauthorized },
      );
    }

    const token = mintPlatformSession();
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Login is not configured" },
        { status: HttpStatus.InternalServerError },
      );
    }

    const res = NextResponse.json(ok({ ok: true }), { status: HttpStatus.Ok });
    res.cookies.set(PLATFORM_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  });
}

/** DELETE /api/platform/login — log out (clears the session cookie). */
export async function DELETE() {
  return withApi(async () => {
    const res = NextResponse.json(ok({ ok: true }), { status: HttpStatus.Ok });
    res.cookies.set(PLATFORM_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  });
}
