/**
 * Server-only: Extract and verify Firebase ID token from Authorization header.
 * Returns uid or a 401 NextResponse.
 */

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export type RequireAuthResult = { uid: string } | NextResponse;

/**
 * Verify Firebase ID token from Authorization: Bearer <token>.
 * Returns { uid } on success, or NextResponse (401) on failure.
 */
export async function requireAuth(request: Request): Promise<RequireAuthResult> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || !token.trim()) {
    return NextResponse.json({ error: "unauthenticated", message: "Missing or invalid Authorization header" }, { status: 401 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token.trim());
    return { uid: decoded.uid };
  } catch (err) {
    console.warn("[requireAuth] Token verification failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "unauthenticated", message: "Invalid or expired token" }, { status: 401 });
  }
}
