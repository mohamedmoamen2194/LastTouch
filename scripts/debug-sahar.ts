import { db } from "@/db";
import { employees, appointments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildSequentialChainSlots, existingBookings, parseDay } from "@/modules/availability/domain/engine";
import { format } from "date-fns";

async function main() {
  const tenantId = "ebf743e1-d0a3-4e68-be70-51668674dfe8";
  const staff = await db.select().from(employees).where(eq(employees.tenantId, tenantId));
  const sara = staff.find((s) => s.firstName === "Sara")!;
  const salma = staff.find((s) => s.firstName === "Salma")!;

  // All appointment dates (local) for the tenant
  const appts = await db.select().from(appointments).where(eq(appointments.tenantId, tenantId));
  const dates = new Set(appts.map((a) => {
    const d = new Date(a.appointmentDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }));

  // Also check the pending appointment's actual local date
  const pending = appts.find((a) => a.status === "pending");
  if (pending) {
    const d = new Date(pending.appointmentDate);
    dates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  for (const ds of [...dates].sort()) {
    const date = parseDay(ds);
    console.log(`\n########## LOCAL DATE ${ds} (${format(date, "EEEE")}) ##########`);
    console.log("Sara busy:", (await existingBookings(sara.id, date)).map((b) => `${fmt(b.start)}-${fmt(b.end)}`));
    console.log("Salma busy:", (await existingBookings(salma.id, date)).map((b) => `${fmt(b.start)}-${fmt(b.end)}`));

    // What the user picks: Sara does Balayage (180), Salma does Hair Treatment (45)
    const chain = await buildSequentialChainSlots({
      assignments: [
        { employeeId: sara.id, serviceDurationMinutes: 180 },
        { employeeId: salma.id, serviceDurationMinutes: 45 },
      ],
      date,
    });
    console.log("CHAIN available:", chain.filter((s) => s.available).map((s) => s.start).join(",") || "(none)");
    console.log("CHAIN blocked:", chain.filter((s) => !s.available).map((s) => s.start).join(",") || "(none)");
  }
}

function fmt(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

main().catch((e) => { console.error(e); process.exit(1); });