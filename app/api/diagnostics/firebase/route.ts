/**
 * GET /api/diagnostics/firebase
 * Returns which Firebase project the client env and server Admin SDK use (no secrets).
 * Use to confirm production uses Caleno, not salon-platform.
 */

import { NextResponse } from "next/server";
import { getAdminProjectId } from "@/lib/firebaseAdmin";

export async function GET() {
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? null;
  const clientAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? null;
  const clientStorageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ?? null;
  let adminProjectId: string | null = null;
  try {
    adminProjectId = getAdminProjectId();
  } catch {
    // Admin not initialized (e.g. no credentials)
  }
  const ok =
    !!clientProjectId &&
    !!clientAuthDomain &&
    !!clientStorageBucket &&
    !!adminProjectId &&
    clientProjectId === adminProjectId;
  return NextResponse.json({
    clientProjectId,
    clientAuthDomain,
    clientStorageBucket,
    adminProjectId,
    ok,
  });
}
