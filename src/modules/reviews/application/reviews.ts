import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, reviews, visits } from "@/db/schema";
import { NotFoundError, ValidationAppError } from "@/lib/errors";

export type ReviewInput = {
  slug: string;
  visitId?: string | null;
  appointmentId?: string | null;
  rating: number;
  comment?: string | null;
  employeeId?: string | null;
};

export async function createPublicReview(tenantId: string, input: ReviewInput) {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ValidationAppError("Rating must be between 1 and 5");
  }

  let appointmentId = input.appointmentId ?? null;
  let customerId: string | null = null;
  const visitId = input.visitId ?? null;

  if (visitId) {
    const [visit] = await db
      .select()
      .from(visits)
      .where(and(eq(visits.id, visitId), eq(visits.tenantId, tenantId)))
      .limit(1);
    if (!visit) throw new NotFoundError("Visit not found");
    if (visit.status !== "checked_out") throw new ValidationAppError("Visit is not complete yet");
    appointmentId = visit.appointmentId ?? appointmentId;
    customerId = visit.customerId ?? null;
  }

  if (!appointmentId) throw new ValidationAppError("A completed visit is required");

  const [appt] = await db
    .select({ id: appointments.id, customerId: appointments.customerId, status: appointments.status })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)))
    .limit(1);
  if (!appt) throw new NotFoundError("Appointment not found");
  if (appt.status !== "completed") throw new ValidationAppError("Appointment is not complete yet");
  customerId = customerId ?? appt.customerId ?? null;

  const [created] = await db
    .insert(reviews)
    .values({
      tenantId,
      appointmentId,
      visitId,
      customerId,
      employeeId: input.employeeId ?? null,
      rating,
      comment: input.comment?.trim() || null,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();

  return { created: Boolean(created), review: created ?? null };
}
