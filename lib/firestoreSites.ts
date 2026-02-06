import { getDb } from "@/lib/firebaseClient";
import { doc, getDoc, setDoc, collection, getDocs, Timestamp } from "firebase/firestore";
import type { SiteConfig, FaqItem, ReviewItem } from "@/types/siteConfig";

const TEMPLATE_SITE_ID = "amitay-hair-mk6krumy";
const SITES_COLLECTION = "sites";

/**
 * Generate demo FAQ items (2 items)
 */
function generateDemoFaqs(): FaqItem[] {
  return [
    {
      id: `faq_${Date.now()}_1`,
      question: "מה מדיניות הביטולים?",
      answer: "ניתן לבטל תור עד 24 שעות מראש ללא תשלום. ביטול ברגע האחרון או אי הגעה יחייבו תשלום של 50% מעלות השירות.",
    },
    {
      id: `faq_${Date.now()}_2`,
      question: "כמה זמן לוקח טיפול?",
      answer: "משך הטיפול תלוי בסוג השירות. תספורת נשים אורכת כ-45-60 דקות, צבע שיער כ-2-3 שעות, וטיפולי פן או החלקה כ-2-4 שעות. נשמח לספק הערכה מדויקת בעת קביעת התור.",
    },
  ];
}

/**
 * Generate demo Review items (3 items)
 */
function generateDemoReviews(): ReviewItem[] {
  return [
    {
      id: `review_${Date.now()}_1`,
      name: "שרה כהן",
      rating: 5,
      text: "חוויה מדהימה! הצוות מקצועי מאוד, האווירה נעימה והתוצאה מעבר למצופה. בהחלט אחזור שוב.",
    },
    {
      id: `review_${Date.now()}_2`,
      name: "מיכל לוי",
      rating: 5,
      text: "הסלון נקי ומסודר, המעצבת הקשיבה לכל הבקשות שלי והתוצאה מושלמת. ממליצה בחום!",
    },
    {
      id: `review_${Date.now()}_3`,
      name: "דני רוזן",
      rating: 4,
      text: "שירות מעולה ומקצועי. התור התחיל בזמן, הטיפול היה איכותי והמחיר הוגן. אמליץ לחברים.",
    },
  ];
}

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
  
  // Prepare final config with demo content if needed
  const finalConfig: SiteConfig = { ...builderConfig };
  
  // Generate demo FAQs if FAQ page is selected and no FAQs exist
  if (builderConfig.extraPages.includes("faq")) {
    const existingFaqs = builderConfig.faqs || [];
    if (existingFaqs.length === 0) {
      finalConfig.faqs = generateDemoFaqs();
      console.log(`[createSiteFromTemplate] Generated ${finalConfig.faqs.length} demo FAQs for site ${newSiteId}`);
    } else {
      console.log(`[createSiteFromTemplate] Site ${newSiteId} already has ${existingFaqs.length} FAQs, skipping demo generation`);
    }
  }
  
  // Generate demo Reviews if Reviews page is selected and no reviews exist
  if (builderConfig.extraPages.includes("reviews")) {
    const existingReviews = builderConfig.reviews || [];
    if (existingReviews.length === 0) {
      finalConfig.reviews = generateDemoReviews();
      console.log(`[createSiteFromTemplate] Generated ${finalConfig.reviews.length} demo reviews for site ${newSiteId}`);
    } else {
      console.log(`[createSiteFromTemplate] Site ${newSiteId} already has ${existingReviews.length} reviews, skipping demo generation`);
    }
  }
  
  // Merge builder config into template data
  // IMPORTANT: Always set ownerUid (and ownerUserId for backwards compatibility) so Firestore rules allow read/write
  const siteData: SiteDocCreate = {
    ...templateDataToCopy,
    ownerUid,
    ownerUserId: ownerUid,
    config: finalConfig,
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
