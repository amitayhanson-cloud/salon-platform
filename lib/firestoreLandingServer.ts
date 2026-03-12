/**
 * Server-only: read platform landing content with Admin SDK.
 * Used by GET /api/landing-content for public read.
 */
import { getAdminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landingContentDefaults";
import type { LandingContent } from "@/types/landingContent";

function mergeWithDefaults(data: Partial<LandingContent> | null): LandingContent {
  if (!data) return DEFAULT_LANDING_CONTENT;
  return {
    hero: { ...DEFAULT_LANDING_CONTENT.hero, ...data.hero },
    about: { ...DEFAULT_LANDING_CONTENT.about, ...data.about },
    how:
      Array.isArray(data.how) && data.how.length > 0
        ? data.how
        : DEFAULT_LANDING_CONTENT.how,
    faq:
      Array.isArray(data.faq) && data.faq.length > 0
        ? data.faq
        : DEFAULT_LANDING_CONTENT.faq,
    features: {
      ...(DEFAULT_LANDING_CONTENT.features ?? {}),
      ...(data.features ?? {}),
    },
    updatedAt: data.updatedAt,
  };
}

export async function getLandingContentServer(): Promise<LandingContent> {
  const db = getAdminDb();
  const ref = db.collection("platform").doc("landing");
  const snap = await ref.get();
  if (!snap.exists) return DEFAULT_LANDING_CONTENT;
  const data = snap.data() as Partial<LandingContent> | undefined;
  return mergeWithDefaults(data ?? null);
}

/**
 * Server-only: update platform landing content (merge). Used by upload API to persist image URLs.
 */
export async function saveLandingContentServer(
  patch: Partial<Omit<LandingContent, "updatedAt">>
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection("platform").doc("landing");
  const { FieldValue } = await import("firebase-admin/firestore");
  const updateData: Record<string, unknown> = { ...patch, updatedAt: FieldValue.serverTimestamp() };
  await ref.set(updateData, { merge: true });
}
