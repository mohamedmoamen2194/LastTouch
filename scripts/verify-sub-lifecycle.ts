/**
 * Verifies subscription lifecycle writes survive (post rogue-trigger drop):
 * cancel sticks, extend moves dates, custom end-date sticks. Cleans up.
 * Run: npx tsx scripts/verify-sub-lifecycle.ts
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
    await sql`DELETE FROM tenants WHERE slug = 'lifecycle-probe'`;
    const [t] = await sql`
      INSERT INTO tenants (slug, business_name, business_type, subscription_plan, active)
      VALUES ('lifecycle-probe', 'Lifecycle Probe', 'barber_shop', 'pro', true)
      RETURNING id`;
    const tenantId = (t as { id: string }).id;
    const get = async () => {
      const rows = await sql`SELECT status, renewal_date, expiration_date FROM subscriptions WHERE tenant_id = ${tenantId}`;
      return rows[0] as unknown as { status: string; renewal_date: string; expiration_date: string };
    };

    // 1. cancel must stick (rogue trigger used to resurrect to active)
    await sql`UPDATE subscriptions SET status='cancelled', auto_renew=false, updated_at=NOW() WHERE tenant_id = ${tenantId}`;
    const s1 = await get();
    console.log("after cancel:", s1.status);
    if (s1.status !== "cancelled") throw new Error("CANCEL DID NOT STICK");

    // 2. extend must move dates exactly (trigger used to recompute them)
    const target = new Date(Date.now() + 90 * 86400000).toISOString();
    await sql`UPDATE subscriptions SET status='active', renewal_date=${target}::timestamptz, expiration_date=${target}::timestamptz, updated_at=NOW() WHERE tenant_id = ${tenantId}`;
    const s2 = await get();
    console.log("after extend:", s2.status, s2.expiration_date);
    if (s2.status !== "active") throw new Error("STATUS NOT STICKING");
    if (Math.abs(new Date(s2.expiration_date).getTime() - new Date(target).getTime()) > 60000) {
      throw new Error("EXTEND DATE DISCARDED");
    }

    // 3. expire must stick
    await sql`UPDATE subscriptions SET status='expired', updated_at=NOW() WHERE tenant_id = ${tenantId}`;
    const s3 = await get();
    console.log("after expire:", s3.status);
    if (s3.status !== "expired") throw new Error("EXPIRE DID NOT STICK");

    console.log("LIFECYCLE E2E OK");
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
