import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError } from "@/lib/errors";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import {
  addTenantImage,
  removeTenantImage,
  setTenantLogo,
} from "@/modules/branding/application/media";

const ALLOWED_KINDS = ["logo", "image"] as const;
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
// Raster formats only — SVGs can embed scripts and would be served as HTML
// by the blob host, creating a stored-XSS vector.
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/**
 * POST /api/admin/media
 * Manages the tenant's brand media in Vercel Blob.
 *
 *   ?slug=...&kind=logo|image          → multipart upload (field "file")
 *   ?slug=...&kind=logo|image&action=remove → JSON { url } delete
 *
 * Logo is stored separately from the shop gallery; both are keyed to the
 * tenant and verified through `gallery.manage` / `branding.manage`.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) throw new ValidationAppError("Missing tenant slug");

    const kind = url.searchParams.get("kind");
    if (!kind || !ALLOWED_KINDS.includes(kind as (typeof ALLOWED_KINDS)[number])) {
      throw new ValidationAppError("Kind must be 'logo' or 'image'");
    }

    const ctx = await getDashboardAccess(slug);
    const action = url.searchParams.get("action") ?? "upload";

    if (action === "remove") {
      const body = await readJson<{ url?: unknown }>(req);
      if (typeof body?.url !== "string" || !body.url.startsWith("https://")) {
        throw new ValidationAppError("Missing media URL");
      }
      if (kind === "logo") {
        const previous = await setTenantLogo(ctx, null);
        if (previous) await safeDelete(previous);
        return NextResponse.json(ok({ url: body.url }, "Logo removed"));
      }
      const next = await removeTenantImage(ctx, body.url);
      if (next.removed) await safeDelete(body.url);
      return NextResponse.json(ok({ images: next.images }, "Image removed"));
    }

    // Upload branch
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationAppError("Missing file field");
    if (!file.type.startsWith("image/") || !ALLOWED_MIME_TYPES.has(file.type))
      throw new ValidationAppError("Only PNG, JPEG, WebP, GIF or AVIF images are allowed");
    if (file.size > MAX_BYTES) throw new ValidationAppError("Image must be 6 MB or smaller");
    if (file.size === 0) throw new ValidationAppError("Image is empty");

    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const key = `${ctx.tenantId}/${kind === "logo" ? "logo" : "gallery"}/${Date.now()}.${ext}`;

    const blob = await put(key, file, {
      access: "public",
      contentType: file.type,
      cacheControlMaxAge: 60 * 60 * 24,
    });

    if (kind === "logo") {
      const previous = await setTenantLogo(ctx, blob.url);
      if (previous && previous !== blob.url) await safeDelete(previous);
      return NextResponse.json(ok({ url: blob.url }, "Logo updated"), { status: HttpStatus.Ok });
    }

    const images = await addTenantImage(ctx, blob.url);
    return NextResponse.json(
      ok({ url: blob.url, images }, "Image uploaded"),
      { status: HttpStatus.Created }
    );
  });
}

async function safeDelete(target: string) {
  try {
    await del(target);
  } catch (e) {
    console.error("[media] failed to delete blob", target, e);
  }
}