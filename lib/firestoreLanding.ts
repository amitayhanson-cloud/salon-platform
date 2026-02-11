import { getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { platformLandingDoc } from "@/lib/firestorePaths";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landingContentDefaults";
import type { LandingContent } from "@/types/landingContent";

function mergeWithDefaults(data: Partial<LandingContent> | null): LandingContent {
  if (!data) return DEFAULT_LANDING_CONTENT;
  return {
    hero: {
      ...DEFAULT_LANDING_CONTENT.hero,
      ...data.hero,
    },
    about: {
      ...DEFAULT_LANDING_CONTENT.about,
      ...data.about,
    },
    how:
      Array.isArray(data.how) && data.how.length > 0
        ? data.how
        : DEFAULT_LANDING_CONTENT.how,
    faq:
      Array.isArray(data.faq) && data.faq.length > 0
        ? data.faq
        : DEFAULT_LANDING_CONTENT.faq,
    updatedAt: data.updatedAt,
  };
}

export async function getLandingContent(): Promise<LandingContent> {
  if (!db) throw new Error("Firestore db not initialized");
  const snap = await getDoc(platformLandingDoc());
  if (!snap.exists()) return DEFAULT_LANDING_CONTENT;
  const data = snap.data() as Partial<LandingContent> | undefined;
  return mergeWithDefaults(data ?? null);
}

export async function saveLandingContent(
  content: Partial<Omit<LandingContent, "updatedAt">>
): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  await setDoc(
    platformLandingDoc(),
    {
      ...content,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
