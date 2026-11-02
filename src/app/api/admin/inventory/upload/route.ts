import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { withApi } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { assertSubscriptionAccess } from "@/lib/subscriptions";
import { Permission } from "@/lib/permissions";
import { assertPermission } from "@/lib/tenant/context";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_FOLDERS = ["products", "machines"] as const;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/** POST /api/admin/inventory/upload?slug=...&folder=products|machines (multipart "file"). */
export async function POST(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) throw new ValidationAppError("Missing tenant slug");
    const folder = url.searchParams.get("folder");
    if (!folder || !ALLOWED_FOLDERS.includes(folder as (typeof ALLOWED_FOLDERS)[number])) {
      throw new ValidationAppError("Folder must be 'products' or 'machines'");
    }

    const ctx = await getDashboardAccess(slug);
    assertPermission(ctx, Permission["inventory.manage"]);
    await assertSubscriptionAccess(ctx.tenantId);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationAppError("Missing file field");
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new ValidationAppError("Only PNG, JPEG, WebP, GIF or AVIF images are allowed");
    }
    if (file.size === 0) throw new ValidationAppError("Image is empty");
    if (file.size > MAX_BYTES) throw new ValidationAppError("Image must be 6 MB or smaller");

    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const key = `${ctx.tenantId}/${folder}/${Date.now()}.${ext}`;
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type,
      cacheControlMaxAge: 60 * 60 * 24,
    });

    return NextResponse.json(ok({ url: blob.url }, "Image uploaded"), { status: HttpStatus.Created });
  });
}
