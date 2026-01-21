import { db } from "./firebaseClient";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import type { SetupStatus } from "@/types/user";

const WEBSITES_COLLECTION = "websites";

/**
 * Update website setup status
 */
export async function updateWebsiteSetupStatus(
  websiteId: string,
  setupStatus: SetupStatus
): Promise<void> {
  if (!db) {
    const error = "Firestore db not initialized. Check Firebase configuration.";
    console.error("❌", error);
    throw new Error(error);
  }

  const websiteRef = doc(db, WEBSITES_COLLECTION, websiteId);
  await setDoc(
    websiteRef,
    {
      setupStatus,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Mark website setup as completed
 */
export async function completeWebsiteSetup(websiteId: string): Promise<void> {
  await updateWebsiteSetupStatus(websiteId, "completed");
}

/**
 * Mark website setup as in progress
 */
export async function setWebsiteSetupInProgress(websiteId: string): Promise<void> {
  await updateWebsiteSetupStatus(websiteId, "in_progress");
}
