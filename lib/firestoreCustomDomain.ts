/**
 * Firestore reads/writes for custom domain mapping.
 * Server-only: uses Firebase Admin SDK.
 * - domains/{domainKey} -> { siteId, domain, status, createdAt, updatedAt }
 * - sites/{siteId} -> customDomain?, customDomainStatus?
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  normalizeDomain,
  domainDocId,
  type CustomDomainStatus,
} from "@/lib/customDomain";

const DOMAINS_COLLECTION = "domains";
const SITES_COLLECTION = "sites";

export type DomainMapping = {
  siteId: string;
  domain: string;
  status: CustomDomainStatus;
  createdAt: unknown;
  updatedAt: unknown;
};

/**
 * Get siteId for a host (custom domain). Returns null if not found or not configured.
 */
export async function getSiteIdByDomain(host: string): Promise<string | null> {
  const normalized = normalizeDomain(host);
  if (!normalized) return null;
  const db = getAdminDb();
  const ref = db.collection(DOMAINS_COLLECTION).doc(domainDocId(normalized));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as DomainMapping | undefined;
  if (!data?.siteId || data.status === "removing" || data.status === "none") return null;
  return data.siteId.trim();
}

/**
 * Check if domain is already assigned to another siteId (for duplicate prevention).
 * Returns existing siteId if any, or null if free.
 */
export async function getSiteIdByDomainOnly(domain: string): Promise<string | null> {
  const normalized = normalizeDomain(domain);
  if (!normalized) return null;
  const db = getAdminDb();
  const ref = db.collection(DOMAINS_COLLECTION).doc(domainDocId(normalized));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as DomainMapping | undefined;
  return data?.siteId?.trim() ?? null;
}

/**
 * Set custom domain on site and create/update domains mapping.
 * Fails if domain is already assigned to a different siteId.
 */
export async function setCustomDomain(
  siteId: string,
  domain: string,
  status: CustomDomainStatus
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizeDomain(domain);
  if (!normalized) return { ok: false, error: "Invalid domain" };

  const db = getAdminDb();
  const domainRef = db.collection(DOMAINS_COLLECTION).doc(domainDocId(normalized));
  const siteRef = db.collection(SITES_COLLECTION).doc(siteId);

  const existing = await domainRef.get();
  if (existing.exists) {
    const data = existing.data() as DomainMapping | undefined;
    const existingSiteId = data?.siteId?.trim();
    if (existingSiteId && existingSiteId !== siteId) {
      return { ok: false, error: "הדומיין כבר משויך לאתר אחר." };
    }
  }

  const now = new Date();
  const payload: DomainMapping = {
    siteId,
    domain: normalized,
    status,
    createdAt: (existing.data() as DomainMapping | undefined)?.createdAt ?? now,
    updatedAt: now,
  };

  await db.runTransaction(async (tx) => {
    tx.set(domainRef, payload, { merge: true });
    tx.update(siteRef, {
      customDomain: normalized,
      customDomainStatus: status,
      customDomainUpdatedAt: now,
      updatedAt: now,
    });
  });

  return { ok: true };
}

/**
 * Remove custom domain from site and delete domains mapping.
 */
export async function removeCustomDomain(siteId: string): Promise<void> {
  const db = getAdminDb();
  const siteRef = db.collection(SITES_COLLECTION).doc(siteId);
  const siteSnap = await siteRef.get();
  const currentDomain = (siteSnap.data() as { customDomain?: string } | undefined)?.customDomain;
  if (!currentDomain?.trim()) return;

  const normalized = normalizeDomain(currentDomain);
  const domainRef = db.collection(DOMAINS_COLLECTION).doc(domainDocId(normalized));

  const now = new Date();
  await db.runTransaction(async (tx) => {
    tx.delete(domainRef);
    tx.update(siteRef, {
      customDomain: null,
      customDomainStatus: "none",
      customDomainUpdatedAt: now,
      updatedAt: now,
    });
  });
}

/**
 * Update only custom domain status on site and domain doc.
 */
export async function updateCustomDomainStatus(
  siteId: string,
  domain: string,
  status: CustomDomainStatus
): Promise<void> {
  const normalized = normalizeDomain(domain);
  if (!normalized) return;

  const db = getAdminDb();
  const domainRef = db.collection(DOMAINS_COLLECTION).doc(domainDocId(normalized));
  const siteRef = db.collection(SITES_COLLECTION).doc(siteId);
  const now = new Date();

  await db.runTransaction(async (tx) => {
    tx.update(domainRef, { status, updatedAt: now });
    tx.update(siteRef, { customDomainStatus: status, updatedAt: now });
  });
}

/**
 * Get current custom domain and status for a site from sites doc.
 */
export async function getCustomDomainForSite(siteId: string): Promise<{
  customDomain: string | null;
  customDomainStatus: CustomDomainStatus | null;
}> {
  const db = getAdminDb();
  const siteSnap = await db.collection(SITES_COLLECTION).doc(siteId).get();
  if (!siteSnap.exists) {
    return { customDomain: null, customDomainStatus: null };
  }
  const d = siteSnap.data() as { customDomain?: string | null; customDomainStatus?: CustomDomainStatus } | undefined;
  return {
    customDomain: d?.customDomain ?? null,
    customDomainStatus: d?.customDomainStatus ?? null,
  };
}
