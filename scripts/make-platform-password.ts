/**
 * Usage: npx tsx scripts/make-platform-password.ts "Your-New-Password"
 * Prints a PLATFORM_ADMIN_PASSWORD_HASH=... line. Paste it into .env.local
 * and Vercel env vars (replacing the old hash), then redeploy.
 *
 * The password itself is never stored — only this scrypt hash.
 */
import { randomBytes, scryptSync } from "node:crypto";

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  const password = process.argv[2];
  if (!password || password.length < 10) {
    console.error("Give a password of at least 10 characters: npx tsx scripts/make-platform-password.ts \"...\"");
    process.exit(1);
  }
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  // `:` separators (NOT `$`): Next.js expands `$VAR` references in .env
  // files, which would corrupt the stored hash.
  console.log(`PLATFORM_ADMIN_PASSWORD_HASH=scrypt:${N}:${r}:${p}:${b64urlEncode(salt)}:${b64urlEncode(hash)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
