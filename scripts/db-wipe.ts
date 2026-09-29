/**
 * DB inspection / wipe helper.
 * Usage:
 *   npx tsx scripts/db-wipe.ts --counts   (read-only: row counts per table)
 *   npx tsx scripts/db-wipe.ts --wipe     (DESTRUCTIVE: truncates ALL app tables)
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k]) continue;
    process.env[k] = raw.replace(/^["']|["']$/g, "");
  }
}

const TABLES = [
  "organizations",
  "tenants",
  "locations",
  "memberships",
  "employees",
  "employee_services",
  "working_hours",
  "breaks",
  "time_off",
  "customers",
  "service_categories",
  "services",
  "packages",
  "package_services",
  "addons",
  "appointments",
  "appointment_services",
  "appointment_employees",
  "appointment_addons",
  "payments",
  "coupons",
  "reviews",
  "notifications",
  "timeline_events",
  "audit_logs",
  "visits",
  "agent_pending_actions",
  "subscriptions",
  "invoices",
  "ai_logs",
  "feature_flags",
  "announcements",
  "client_profiles",
  "client_favorites",
  "client_payment_methods",
  "client_points_ledger",
  "referrals",
];

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const mode = process.argv[2] ?? "--counts";
  const sql = postgres(url, { max: 1 });
  try {
    if (mode === "--counts") {
      let total = 0;
      for (const t of TABLES) {
        const rows = await sql.unsafe(`SELECT COUNT(*)::int AS c FROM "${t}"`);
        const c = (rows[0] as unknown as { c: number }).c;
        total += c;
        console.log(`${t}: ${c}`);
      }
      console.log(`TOTAL: ${total}`);
    } else if (mode === "--wipe") {
      const list = TABLES.map((t) => `"${t}"`).join(", ");
      await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
      console.log("WIPE DONE: all tables truncated.");
    } else {
      throw new Error(`Unknown mode ${mode}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
