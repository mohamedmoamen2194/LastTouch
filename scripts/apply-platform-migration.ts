/**
 * One-off: adds platform-admin columns to the live DB.
 * Reads DATABASE_URL from .env.local (or env), applies idempotent ALTERs,
 * then verifies. Run: npx tsx scripts/apply-platform-migration.ts
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
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const sql = postgres(url, { max: 1 });

  const statements = [
    `ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "custom_monthly_price" numeric(12, 2) DEFAULT '0' NOT NULL`,
    `ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "notes" text`,
  ];

  try {
    for (const s of statements) {
      await sql.unsafe(s);
      console.log("OK:", s.slice(0, 70) + "…");
    }
    const cols = await sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'subscriptions' AND column_name IN ('custom_monthly_price', 'notes')
    `;
    console.log("Verified columns:", cols);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
