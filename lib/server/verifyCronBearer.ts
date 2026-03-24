import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Strict cron auth: `Authorization: Bearer <CRON_SECRET>` must match env exactly.
 * Uses timing-safe comparison. Does not trust User-Agent or other headers.
 */
export function verifyCronBearerSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret) return false;

  const auth = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) return false;

  const token = auth.slice(prefix.length).trim();
  try {
    const a = Buffer.from(secret, "utf8");
    const b = Buffer.from(token, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
