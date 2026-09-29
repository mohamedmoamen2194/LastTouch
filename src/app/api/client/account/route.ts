import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { withApi } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/db";
import { clientFavorites, clientPaymentMethods, clientProfiles } from "@/db/schema";

/**
 * DELETE /api/client/account — permanently delete my client account:
 * profile, favorites and payment references are wiped immediately, then
 * the Clerk user is deleted (the webhook finishes the rest).
 */
export async function DELETE() {
  return withApi(async () => {
    const userId = await requireUserId();

    await db.delete(clientPaymentMethods).where(eq(clientPaymentMethods.userId, userId));
    await db.delete(clientFavorites).where(eq(clientFavorites.userId, userId));
    await db.delete(clientProfiles).where(eq(clientProfiles.userId, userId));

    try {
      const client = await clerkClient();
      await client.users.deleteUser(userId);
    } catch {
      // Identity cleanup is best-effort; client data is already gone.
    }

    return NextResponse.json(ok({ deleted: true }), { status: HttpStatus.Ok });
  });
}
