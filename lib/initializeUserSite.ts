/**
 * Initialize user site from template (LEGACY)
 * Reads from templates/hair1 and writes to users/{uid}/site/main
 * Note: users/{uid}/site/main is legacy; current model uses sites/{siteId} + tenants.
 */

import { db } from "./firebaseClient";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { DEFAULT_HAIR_TEMPLATE_KEY, TEMPLATES_COLLECTION } from "@/types/template";

export async function initializeUserSiteFromTemplate(userId: string): Promise<void> {
  if (!db) {
    throw new Error("Firestore db not initialized");
  }

  const userSiteRef = doc(db, "users", userId, "site", "main");
  const userSiteSnap = await getDoc(userSiteRef);

  if (userSiteSnap.exists()) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[initializeUserSite] User site already exists for uid=${userId}, skipping`);
    }
    return;
  }

  const templateRef = doc(db, TEMPLATES_COLLECTION, DEFAULT_HAIR_TEMPLATE_KEY);
  const templateSnap = await getDoc(templateRef);

  if (!templateSnap.exists()) {
    throw new Error(
      `Template "${DEFAULT_HAIR_TEMPLATE_KEY}" not found. Run scripts/createHair1TemplateFromSite.ts to create it.`
    );
  }

  const templateData = templateSnap.data() as { configDefaults?: Record<string, unknown> };
  const configDefaults = templateData?.configDefaults ?? {};

  const now = Timestamp.now();

  await setDoc(userSiteRef, {
    config: configDefaults,
    ownerUserId: userId,
    businessType: "hair",
    templateKey: DEFAULT_HAIR_TEMPLATE_KEY,
    templateSource: `templates/${DEFAULT_HAIR_TEMPLATE_KEY}`,
    createdAt: now,
    updatedAt: now,
    initializedFromTemplate: true,
  });

  if (process.env.NODE_ENV === "development") {
    console.log(`[initializeUserSite] Initialized user site for uid=${userId} from template ${DEFAULT_HAIR_TEMPLATE_KEY}`);
  }
}

/**
 * Ensure user site exists, initializing from template if needed
 * Returns true if site was initialized, false if it already existed
 */
export async function ensureUserSite(userId: string): Promise<boolean> {
  if (!db) {
    throw new Error("Firestore db not initialized");
  }

  const userSiteRef = doc(db, "users", userId, "site", "main");
  const userSiteSnap = await getDoc(userSiteRef);
  
  if (userSiteSnap.exists()) {
    return false; // Already exists
  }

  // Initialize from template
  await initializeUserSiteFromTemplate(userId);
  return true; // Was initialized
}
