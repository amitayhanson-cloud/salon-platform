import { getDb } from "@/lib/firebaseClient";
import { doc, getDoc, setDoc, collection, getDocs, Timestamp } from "firebase/firestore";
import type { SiteConfig } from "@/types/siteConfig";

const TEMPLATE_SITE_ID = "amitay-hair-mk6krumy";
const SITES_COLLECTION = "sites";

/**
 * Site metadata type for ownership checks
 * Represents the minimal fields needed from a site document
 */
type SiteMeta = {
  id: string;
  ownerUid?: string | null;
};

/**
 * Full site document type (what's stored in Firestore)
 */
type SiteDoc = {
  id: string;
  ownerUid?: string | null;
  config?: SiteConfig;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  [key: string]: any; // Allow other fields from template
};

/**
 * Get site document reference
 * Path: sites/{siteId}
 */
export function siteDoc(siteId: string) {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  return doc(db, SITES_COLLECTION, siteId);
}

/**
 * Get site document
 * Returns the full site document with all fields
 */
export async function getSite(siteId: string): Promise<SiteDoc | null> {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  const siteRef = siteDoc(siteId);
  const siteSnap = await getDoc(siteRef);
  
  if (!siteSnap.exists()) {
    return null;
  }
  
  const data = siteSnap.data() as Partial<SiteDoc>;
  return {
    id: siteSnap.id,
    ...data,
  } as SiteDoc;
}

/**
 * Create a new site from template
 * Copies data from sites/amitay-hair-mk6krumy to new sites/{siteId}
 * Returns the new siteId
 */
export async function createSiteFromTemplate(
  ownerUid: string,
  builderConfig: SiteConfig
): Promise<string> {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  // Load template site
  const templateSiteRef = doc(db, SITES_COLLECTION, TEMPLATE_SITE_ID);
  const templateSiteSnap = await getDoc(templateSiteRef);
  
  if (!templateSiteSnap.exists()) {
    throw new Error(`Template site ${TEMPLATE_SITE_ID} not found`);
  }
  
  const templateData = templateSiteSnap.data();
  
  // Create new site document
  const newSiteRef = doc(collection(db, SITES_COLLECTION));
  const newSiteId = newSiteRef.id;
  const now = Timestamp.now();
  
  // Copy template data, merge with builder config
  // Remove any existing owner fields from template (ownerUid, ownerUserId, etc.)
  const { ownerUid: _, ownerUserId: __, ...templateDataToCopy } = templateData;
  
  // Merge builder config into template data
  // IMPORTANT: Always set ownerUid explicitly (don't rely on template)
  const siteData = {
    ...templateDataToCopy,
    ownerUid, // Explicitly set ownerUid to the current user's UID
    config: builderConfig,
    createdAt: now,
    updatedAt: now,
    initializedFromTemplate: true,
    templateSource: TEMPLATE_SITE_ID,
  };
  
  await setDoc(newSiteRef, siteData);
  
  console.log(`[createSiteFromTemplate] Created site ${newSiteId} for owner ${ownerUid} with ownerUid=${ownerUid}`);
  
  return newSiteId;
}

/**
 * Verify site ownership
 * Returns true if sites/{siteId}.ownerUid === currentUid
 */
export async function verifySiteOwnership(
  siteId: string,
  currentUid: string
): Promise<boolean> {
  const site = await getSite(siteId);
  if (!site) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[verifySiteOwnership] Site ${siteId} not found`);
    }
    return false;
  }
  
  // Check ownerUid (primary field)
  const siteOwnerUid = site.ownerUid ?? null;
  const isOwner = siteOwnerUid === currentUid;
  
  if (process.env.NODE_ENV === "development") {
    console.log(`[verifySiteOwnership] siteId=${siteId}, ownerUid=${siteOwnerUid}, currentUid=${currentUid}, isOwner=${isOwner}`);
  }
  
  return isOwner;
}

/**
 * Backfill ownerUid for existing sites that are missing it
 * This is a one-time migration function
 */
export async function backfillSiteOwnerUid(userId: string): Promise<void> {
  try {
    // Get user's siteId
    const { getUserDocument } = await import("@/lib/firestoreUsers");
    const userDoc = await getUserDocument(userId);
    
    if (!userDoc?.siteId) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[backfillSiteOwnerUid] User ${userId} has no siteId, skipping backfill`);
      }
      return;
    }
    
    const siteId = userDoc.siteId;
    const site = await getSite(siteId);
    
    if (!site) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[backfillSiteOwnerUid] Site ${siteId} not found, skipping backfill`);
      }
      return;
    }
    
    // Extract ownerUid safely (handle undefined/null)
    const currentOwner = site.ownerUid ?? null;
    
    // Check if ownerUid is missing or incorrect
    if (!currentOwner || currentOwner !== userId) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[backfillSiteOwnerUid] Backfilling ownerUid for site ${siteId}: ${currentOwner || "missing"} -> ${userId}`);
      }
      
      const siteRef = siteDoc(siteId);
      await setDoc(
        siteRef,
        {
          ownerUid: userId,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
      
      console.log(`[backfillSiteOwnerUid] Successfully backfilled ownerUid for site ${siteId}`);
    } else {
      if (process.env.NODE_ENV === "development") {
        console.log(`[backfillSiteOwnerUid] Site ${siteId} already has correct ownerUid=${userId}`);
      }
    }
  } catch (error) {
    console.error("[backfillSiteOwnerUid] Error during backfill:", error);
    // Don't throw - backfill is optional
  }
}

/**
 * Get site config from sites/{siteId}.config
 */
export async function getSiteConfig(siteId: string): Promise<SiteConfig | null> {
  const site = await getSite(siteId);
  if (!site) {
    return null;
  }
  
  return site.config as SiteConfig | null;
}

/**
 * Save site config to sites/{siteId}.config
 */
export async function saveSiteConfig(
  siteId: string,
  config: SiteConfig
): Promise<void> {
  const siteRef = siteDoc(siteId);
  await setDoc(
    siteRef,
    {
      config,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  
  console.log(`[saveSiteConfig] Saved config to sites/${siteId}`);
}

/**
 * Subscribe to site config changes
 */
export function subscribeSiteConfig(
  siteId: string,
  onData: (config: SiteConfig | null) => void,
  onError?: (e: unknown) => void
): () => void {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  const { onSnapshot } = require("firebase/firestore");
  const siteRef = siteDoc(siteId);
  
  return onSnapshot(
    siteRef,
    (snap: any) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const siteData = snap.data();
      const config = siteData?.config;
      onData(config ? (config as SiteConfig) : null);
    },
    (err: unknown) => {
      console.error("[subscribeSiteConfig] error", err);
      onError?.(err);
    }
  );
}
