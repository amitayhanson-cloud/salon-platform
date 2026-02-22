/**
 * Server-only: Rate limiting for API routes.
 * - Development: in-memory Map (resets on restart).
 * - Production: Firestore-based with TTL fields (no Redis required).
 */

import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const RATE_LIMITS_COLLECTION = "rateLimits";
const WINDOW_CLEANUP_MS = 60 * 60 * 1000; // 1 hour - docs older than this are ignored

const memoryStore = new Map<string, { count: number; windowStart: number }>();

function hashKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return `rl_${Math.abs(h).toString(36)}`;
}

/**
 * Get client IP for rate limiting (handles Vercel/proxy headers).
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Check if the key is within the rate limit.
 * Returns true if allowed, false if rate limited.
 *
 * @param key - Unique key (e.g. "ip:1.2.3.4" or "booking:siteId:bookingId")
 * @param limit - Max requests per window
 * @param windowMs - Window size in milliseconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const hashed = hashKey(key);
  const now = Date.now();

  if (process.env.NODE_ENV === "development" && !process.env.USE_FIRESTORE_RATE_LIMIT) {
    const entry = memoryStore.get(hashed);
    if (!entry) {
      memoryStore.set(hashed, { count: 1, windowStart: now });
      return { allowed: true };
    }
    if (now - entry.windowStart > windowMs) {
      memoryStore.set(hashed, { count: 1, windowStart: now });
      return { allowed: true };
    }
    if (entry.count >= limit) {
      return { allowed: false, retryAfterMs: windowMs - (now - entry.windowStart) };
    }
    entry.count++;
    return { allowed: true };
  }

  const db = getAdminDb();
  const docRef = db.collection(RATE_LIMITS_COLLECTION).doc(hashed);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() : null;
    const rawStart = data?.windowStart;
    const windowStart =
      typeof rawStart?.toMillis === "function"
        ? rawStart.toMillis()
        : typeof rawStart === "number"
          ? rawStart
          : now;
    const count = (data?.count as number) ?? 0;

    if (!snap.exists || now - windowStart > windowMs) {
      tx.set(docRef, {
        count: 1,
        windowStart: Timestamp.fromMillis(now),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { allowed: true };
    }
    if (count >= limit) {
      return { allowed: false, retryAfterMs: Math.max(0, windowMs - (now - windowStart)) };
    }
    tx.set(docRef, {
      count: count + 1,
      windowStart: Timestamp.fromMillis(windowStart),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { allowed: true };
  });

  return result;
}
