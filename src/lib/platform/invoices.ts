import { db } from "@/db";
import { invoices } from "@/db/schema";
import { cycleTotal, dbPlanLabel } from "@/lib/platform/plans";
import type { BillingPeriod, SubscriptionPlan } from "@/db/schema";

/** Create a platform invoice for one billing cycle. Amount is derived from the plan catalog. */
export async function createCycleInvoice(args: {
  tenantId: string;
  plan: SubscriptionPlan;
  billingPeriod: BillingPeriod;
  customMonthlyPrice?: number | string | null;
  paymentMethod?: string | null;
  status?: string;
}): Promise<{ invoiceNumber: string; amount: number | null }> {
  const amount = cycleTotal(args.plan, args.billingPeriod, args.customMonthlyPrice);
  const invoiceNumber = `LT-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  if (amount === null || args.plan === "free") {
    return { invoiceNumber, amount };
  }
  await db.insert(invoices).values({
    tenantId: args.tenantId,
    invoiceNumber,
    plan: `${dbPlanLabel(args.plan)} / ${args.billingPeriod}`,
    amount: String(amount),
    tax: "0",
    discount: "0",
    status: args.status ?? "paid",
    paymentMethod: args.paymentMethod ?? "manual",
    issueDate: new Date(),
  });
  return { invoiceNumber, amount };
}
