import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { ValidationAppError, ConflictError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { hashInviteCode, claimStaffInvite } from "@/modules/staff/application/invites";
import { db } from "@/db";
import { staffInvites, tenants, employees } from "@/db/schema";

const bodySchema = z.object({
  code: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(200),
  lastName: z.string().min(1).max(200),
});

/**
 * POST /api/worker/onboard
 * Public worker onboarding: creates a Clerk account, claims the staff invite,
 * and links the employee record. No pre-existing session required.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const parsed = bodySchema.safeParse(await readJson<unknown>(req));
    if (!parsed.success) throw new ValidationAppError("Invalid onboarding payload");
    const { code, email, password, firstName, lastName } = parsed.data;

    // --- 1. Resolve the invite (public, no auth needed) ---
    const codeHash = hashInviteCode(code.trim().toUpperCase());
    const [invite] = await db
      .select()
      .from(staffInvites)
      .where(eq(staffInvites.codeHash, codeHash))
      .limit(1);
    if (!invite) throw new NotFoundError("This invite code is not valid");
    if (invite.usedAt) throw new ConflictError("This invite has already been used");
    if (invite.expiresAt.getTime() <= Date.now()) throw new ValidationAppError("This invite has expired");

    const [tenant] = await db
      .select({ id: tenants.id, slug: tenants.slug, businessName: tenants.businessName })
      .from(tenants)
      .where(eq(tenants.id, invite.tenantId))
      .limit(1);
    if (!tenant) throw new NotFoundError("Store not found");

    const [employee] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, invite.employeeId), eq(employees.tenantId, invite.tenantId)))
      .limit(1);
    if (!employee) throw new NotFoundError("This team member no longer exists");
    if (!employee.active) throw new ForbiddenError("This team member is inactive");
    if (employee.userId) throw new ConflictError("This team member already has a linked account");

    // --- 2. Create the Clerk user via Clerk's backend REST API ---
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (!clerkSecret) throw new ValidationAppError("Clerk is not configured on this server");

    const clerkRes = await fetch("https://api.clerk.com/v1/users", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clerkSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: [email],
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      }),
    });

    if (!clerkRes.ok) {
      const errBody = await clerkRes.text();
      let message = "Could not create account";
      try {
        const json = JSON.parse(errBody);
        if (json.errors?.[0]?.message) message = json.errors[0].message;
      } catch {
        /* ignore parse errors */
      }
      if (clerkRes.status === 409 || message.toLowerCase().includes("already exists")) {
        throw new ConflictError("An account with this email already exists");
      }
      throw new ValidationAppError(message);
    }

    const clerkUser = await clerkRes.json();
    const userId = clerkUser.id as string;

    // --- 3. Claim the invite (links employee to the new Clerk account) ---
    await claimStaffInvite(userId, code);

    return NextResponse.json(
      ok({ userId, tenantSlug: tenant.slug, tenantName: tenant.businessName }, "Worker account created"),
      { status: HttpStatus.Created },
    );
  });
}
