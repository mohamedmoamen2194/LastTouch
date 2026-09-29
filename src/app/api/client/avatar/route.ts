import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { withApi } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { requireUserId } from "@/lib/auth/session";
import { upsertClientProfile } from "@/lib/marketplace/client";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/**
 * POST /api/client/avatar — upload my profile photo (multipart, field "file").
 * Stored in Vercel Blob; only raster formats (no SVG scripts).
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationAppError("Missing file field");
    if (!file.type.startsWith("image/") || !ALLOWED_MIME_TYPES.has(file.type)) {
      throw new ValidationAppError("Only PNG, JPEG, WebP, GIF or AVIF images are allowed");
    }
    if (file.size > MAX_BYTES) throw new ValidationAppError("Image must be 4 MB or smaller");
    if (file.size === 0) throw new ValidationAppError("Image is empty");

    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const blob = await put(`clients/${userId}/avatar/${Date.now()}.${ext}`, file, {
      access: "public",
      contentType: file.type,
    });
    await upsertClientProfile(userId, { avatarUrl: blob.url });
    return NextResponse.json(ok({ url: blob.url }), { status: HttpStatus.Created });
  });
}
