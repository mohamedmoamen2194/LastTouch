import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { ok, HttpStatus } from "@/lib/response";
import { listMarketplaceStores } from "@/lib/marketplace/stores";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/marketplace/stores — public store catalog (powers nearby
 * sorting + favorites enrichment on the client).
 */
export async function GET(req: Request) {
  return withApi(async () => {
    rateLimit(`marketplace:stores:${clientIp(req)}`, 60);
    const stores = await listMarketplaceStores();
    return NextResponse.json(ok({ stores }), {
      status: HttpStatus.Ok,
      headers: { "Cache-Control": "public, max-age=60" },
    });
  });
}
