/**
 * Removes the rogue `trg_subscriptions_sync_dates` trigger.
 *
 * That trigger ran BEFORE UPDATE on subscriptions and FORCE-overwrote every
 * write: status back to 'active', started_at to now(), renewal/expiration
 * recomputed from billing_period. Consequences were silent and severe:
 * - platform "cancel" / "expire" never stuck (resurrected to active),
 * - platform "extend" / custom end-dates were discarded and recomputed,
 * - owner auto-renew toggle on an expired sub resurrected it with fresh dates.
 *
 * All date/status logic lives in the application layer
 * (/api/subscription, /api/platform/subscriptions), which always writes
 * explicit values — the trigger only destroyed intent. Safe to drop:
 * it never ran on INSERT, and no code depends on its rewrites.
 *
 * Run: npx tsx scripts/drop-rogue-trigger.ts
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

async function main() {
  loadEnvLocal();
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });
  try {
    await sql`DROP TRIGGER IF EXISTS trg_subscriptions_sync_dates ON subscriptions`;
    await sql`DROP FUNCTION IF EXISTS sync_subscription_dates()`;
    const left = await sql`
      SELECT trigger_name FROM information_schema.triggers
      WHERE event_object_schema = 'public' AND trigger_name = 'trg_subscriptions_sync_dates'`;
    console.log("rogue trigger remaining:", (left as unknown[]).length);
    if ((left as unknown[]).length > 0) throw new Error("drop failed");
    console.log("DROP OK");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
