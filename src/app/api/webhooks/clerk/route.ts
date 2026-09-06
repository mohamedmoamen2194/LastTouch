import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  aiLogs,
  auditLogs,
  employees,
  memberships,
  notifications,
  organizations,
  tenants,
} from "@/db/schema";

export const dynamic = "force-dynamic";

type ClerkEvent = {
  type: string;
  data: { id?: string; deleted?: boolean };
};

/**
 * POST /api/webhooks/clerk
 * Keeps the DB in sync with Clerk (dynamic cleanup):
 * - user.deleted → removes their memberships, nullifies their references,
 *   and hard-deletes tenants they solely own (tenant FK cascades wipe
 *   services, employees, appointments, etc.).
 *
 * Setup:
 * 1. Clerk Dashboard → (Production) → Webhooks → Add endpoint:
 *    https://<your-domain>/api/webhooks/clerk, subscribe to user.deleted.
 * 2. Copy the Signing Secret → Vercel env CLERK_WEBHOOK_SECRET (Secrets,
 *    Production) + local .env.local. Redeploy after adding.
 */
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, message: "Webhook not configured" },
      { status: 500 },
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { success: false, message: "Missing signature" },
      { status: 400 },
    );
  }

  let evt: ClerkEvent;
  try {
    const payload = await req.text();
    const wh = new Webhook(secret);
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as unknown as ClerkEvent;
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid signature" },
      { status: 400 },
    );
  }

  if (evt.type === "user.deleted") {
    const userId = evt.data.id;
    if (userId) await handleUserDeleted(userId);
  }

  return NextResponse.json({ success: true });
}

async function handleUserDeleted(userId: string) {
  // Tenants where this user is an active owner.
  const owned = await db
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.role, "owner"),
        eq(memberships.active, true),
      ),
    );

  for (const { tenantId } of owned) {
    // Keep the store alive if another active owner remains.
    const others = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenantId),
          eq(memberships.role, "owner"),
          eq(memberships.active, true),
          ne(memberships.userId, userId),
        ),
      )
      .limit(1);
    if (others.length === 0) {
      // Cascades wipe locations, services, employees, appointments, etc.
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  }

  // Remove all of the user's memberships.
  await db.delete(memberships).where(eq(memberships.userId, userId));

  // Nullify loose references (no FK to Clerk, so no cascade).
  await db
    .update(employees)
    .set({ userId: null })
    .where(eq(employees.userId, userId));
  await db
    .update(organizations)
    .set({ ownerUserId: null })
    .where(eq(organizations.ownerUserId, userId));
  await db
    .update(notifications)
    .set({ recipientUserId: null })
    .where(eq(notifications.recipientUserId, userId));
  await db
    .update(aiLogs)
    .set({ userId: null })
    .where(eq(aiLogs.userId, userId));
  await db
    .update(auditLogs)
    .set({ actorUserId: null })
    .where(eq(auditLogs.actorUserId, userId));
}
