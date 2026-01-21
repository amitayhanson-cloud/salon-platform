/**
 * Initialize user site from template
 * Copies data from sites/amitay-hair-mk6krumy to users/{uid}/site/main
 */

import { db } from "./firebaseClient";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

const TEMPLATE_SITE_ID = "amitay-hair-mk6krumy";

export async function initializeUserSiteFromTemplate(userId: string): Promise<void> {
  if (!db) {
    throw new Error("Firestore db not initialized");
  }

  // Check if user site already exists
  const userSiteRef = doc(db, "users", userId, "site", "main");
  const userSiteSnap = await getDoc(userSiteRef);
  
  if (userSiteSnap.exists()) {
    // User site already exists, no need to initialize
    if (process.env.NODE_ENV === "development") {
      console.log(`[initializeUserSite] User site already exists for uid=${userId}, skipping initialization`);
    }
    return;
  }

  // Load template site
  const templateSiteRef = doc(db, "sites", TEMPLATE_SITE_ID);
  const templateSiteSnap = await getDoc(templateSiteRef);
  
  if (!templateSiteSnap.exists()) {
    throw new Error(`Template site ${TEMPLATE_SITE_ID} not found`);
  }

  const templateData = templateSiteSnap.data();
  
  // Copy template data to user site
  // Exclude ownerUserId from template (we'll set it to the current user)
  const { ownerUserId, ...siteDataToCopy } = templateData;
  
  const now = Timestamp.now();
  
  // Create user site with template data
  await setDoc(userSiteRef, {
    ...siteDataToCopy,
    ownerUserId: userId,
    createdAt: now,
    updatedAt: now,
    // Mark as initialized from template
    initializedFromTemplate: true,
    templateSource: TEMPLATE_SITE_ID,
  });

  if (process.env.NODE_ENV === "development") {
    console.log(`[initializeUserSite] Initialized user site for uid=${userId} from template ${TEMPLATE_SITE_ID}`);
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
