import { getDb } from "@/lib/firebaseClient";
import { doc, getDoc, setDoc, collection, Timestamp } from "firebase/firestore";
import type { SiteConfig } from "@/types/siteConfig";
import type { TemplateConfigDefaults } from "@/types/template";
import { DEFAULT_HAIR_TEMPLATE_KEY, TEMPLATES_COLLECTION } from "@/types/template";
import { generateDemoFaqs, generateDemoReviews } from "@/lib/demoContent";
import { mergeTemplateWithBuilderConfig } from "@/lib/mergeTemplateConfig";

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
  ownerUserId?: string | null;
  config?: SiteConfig;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  [key: string]: any; // Allow other fields from template
};

/** Site document fields we always set when creating a site (required for Firestore rules). */
export type SiteDocCreate = Omit<SiteDoc, "id"> & { ownerUid: string; ownerUserId?: string };

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
 * Create a new site from template (client-side).
 * Reads from templates/{templateKey}, merges with builder config, creates site.
 * Use createSiteFromTemplateServer in API routes instead.
 *
 * @param ownerUid - Owner user ID
 * @param builderConfig - Config from builder (salonName, services, etc.)
 * @param options - Optional templateKey (default: hair1)
 * @returns The new site document ID
 */
export async function createSiteFromTemplate(
  ownerUid: string,
  builderConfig: SiteConfig,
  options: { templateKey?: string } = {}
): Promise<string> {
  const db = getDb();
  const templateKey = options.templateKey ?? DEFAULT_HAIR_TEMPLATE_KEY;

  const templateRef = doc(db, TEMPLATES_COLLECTION, templateKey);
  const templateSnap = await getDoc(templateRef);

  if (!templateSnap.exists()) {
    throw new Error(
      `Template "${templateKey}" not found. Run scripts/createHair1TemplateFromSite.ts to create the template.`
    );
  }

  const templateData = templateSnap.data() as { configDefaults?: TemplateConfigDefaults };
  const configDefaults = (templateData?.configDefaults ?? {}) as TemplateConfigDefaults;

  let finalConfig = mergeTemplateWithBuilderConfig(configDefaults, builderConfig);

  if (finalConfig.extraPages?.includes("faq") && (!finalConfig.faqs || finalConfig.faqs.length === 0)) {
    finalConfig = { ...finalConfig, faqs: generateDemoFaqs() };
  }
  if (finalConfig.extraPages?.includes("reviews") && (!finalConfig.reviews || finalConfig.reviews.length === 0)) {
    finalConfig = { ...finalConfig, reviews: generateDemoReviews() };
  }

  const newSiteRef = doc(collection(db, SITES_COLLECTION));
  const now = Timestamp.now();

  const siteData: SiteDocCreate = {
    ownerUid,
    ownerUserId: ownerUid,
    config: finalConfig,
    businessType: "hair",
    templateKey,
    templateSource: `templates/${templateKey}`,
    createdAt: now,
    updatedAt: now,
    initializedFromTemplate: true,
  };

  await setDoc(newSiteRef, siteData);
  console.log(`[createSiteFromTemplate] Created site ${newSiteRef.id} (template: ${templateKey})`);
  return newSiteRef.id;
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
 * Get site config from sites/{siteId}.config (with slug from top-level site doc merged in).
 */
export async function getSiteConfig(siteId: string): Promise<SiteConfig | null> {
  const site = await getSite(siteId);
  if (!site) {
    return null;
  }
  const config = site.config as SiteConfig | undefined;
  const slug = (site as { slug?: string }).slug ?? config?.slug ?? null;
  return config ? { ...config, slug } : null;
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
    (snap: { exists: () => boolean; data: () => Record<string, unknown> }) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const siteData = snap.data();
      const config = siteData?.config as SiteConfig | undefined;
      const slug = typeof siteData?.slug === "string" && (siteData.slug as string).trim()
        ? (siteData.slug as string).trim()
        : config?.slug ?? null;
      onData(config ? { ...config, slug } : null);
    },
    (err: unknown) => {
      console.error("[subscribeSiteConfig] error", err);
      onError?.(err);
    }
  );
}
