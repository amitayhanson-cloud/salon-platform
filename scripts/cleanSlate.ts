/**
 * Clean Slate Script
 *
 * Deletes all users, sites, tenant data, storage, and rate limits EXCEPT:
 * - Protected users: amitayhanson@gmail.com, aviazulay@gmail.com
 * - Their sites and all data under those sites
 * - SAFE_SITE_IDS: sites always kept (e.g. amitay-hair-mk6krumy for template transition)
 *
 * Usage:
 *   DRY RUN (default - logs what WOULD be deleted):
 *     npx tsx scripts/cleanSlate.ts
 *     npx tsx scripts/cleanSlate.ts --dry-run
 *
 *   EXECUTE (actually delete):
 *     npx tsx scripts/cleanSlate.ts --execute
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH in .env.local
 * Optional: FIREBASE_STORAGE_BUCKET for storage cleanup
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// =============================================================================
// SAFETY: Set to false to actually delete. Default true = dry run only.
// =============================================================================
const DRY_RUN = !process.argv.includes("--execute");

const PROTECTED_EMAILS = ["amitayhanson@gmail.com", "aviazulay@gmail.com"] as const;

/** Sites always kept regardless of owner (e.g. template seed during transition) */
const SAFE_SITE_IDS = new Set(["amitay-hair-mk6krumy"]);

async function main() {
  console.log("\n" + "=".repeat(70));
  if (DRY_RUN) {
    console.log("  CLEAN SLATE - DRY RUN (no changes will be made)");
    console.log("  To execute, run: npx tsx scripts/cleanSlate.ts --execute");
  } else {
    console.log("  !!! CLEAN SLATE - EXECUTING DELETIONS !!!");
    console.log("  Protected: amitayhanson@gmail.com, aviazulay@gmail.com");
    console.log("  SAFE_SITE_IDS (always kept):", Array.from(SAFE_SITE_IDS).join(", "));
  }
  console.log("=".repeat(70) + "\n");

  const { getAdminAuth, getAdminDb } = await import("../lib/firebaseAdmin");

  const auth = getAdminAuth();
  const db = getAdminDb();

  // -------------------------------------------------------------------------
  // 1) Fetch UIDs of protected users
  // -------------------------------------------------------------------------
  const SAFE_UIDS: string[] = [];
  for (const email of PROTECTED_EMAILS) {
    try {
      const user = await auth.getUserByEmail(email);
      SAFE_UIDS.push(user.uid);
      console.log(`[SAFE] ${email} -> uid=${user.uid}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("no user") || msg.includes("not found")) {
        console.warn(`[WARN] Protected user not found: ${email}`);
      } else {
        throw e;
      }
    }
  }

  if (SAFE_UIDS.length === 0) {
    console.error("[FATAL] No protected users found. Aborting.");
    process.exit(1);
  }

  const safeSet = new Set(SAFE_UIDS);

  // -------------------------------------------------------------------------
  // 2) Get protected site IDs (SAFE_SITE_IDS + sites owned by SAFE_UIDS)
  // -------------------------------------------------------------------------
  const sitesSnap = await db.collection("sites").get();
  const protectedSiteIds = new Set<string>(SAFE_SITE_IDS);
  const sitesToDelete: { siteId: string; ownerUid: string }[] = [];

  for (const doc of sitesSnap.docs) {
    if (SAFE_SITE_IDS.has(doc.id)) {
      protectedSiteIds.add(doc.id);
      continue;
    }
    const data = doc.data();
    const ownerUid = (data?.ownerUid ?? data?.ownerUserId ?? "") as string;
    if (safeSet.has(ownerUid)) {
      protectedSiteIds.add(doc.id);
    } else {
      sitesToDelete.push({ siteId: doc.id, ownerUid: ownerUid || "(none)" });
    }
  }

  console.log(`\n[SAFE] Protected siteIds: ${Array.from(protectedSiteIds).sort().join(", ") || "(none)"}`);
  if (SAFE_SITE_IDS.size > 0) {
    console.log(`[SAFE] SAFE_SITE_IDS (always kept): ${Array.from(SAFE_SITE_IDS).join(", ")}`);
  }
  console.log(`[DELETE] Sites to remove: ${sitesToDelete.length}`);

  // -------------------------------------------------------------------------
  // 3) Delete Firebase Auth users (except SAFE_UIDS)
  // -------------------------------------------------------------------------
  const deletedAuthUsers: string[] = [];
  let nextPageToken: string | undefined;

  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    for (const user of listResult.users) {
      if (safeSet.has(user.uid)) continue;
      if (DRY_RUN) {
        console.log(`[DRY] Would delete Auth user: ${user.uid} (${user.email ?? "no email"})`);
      } else {
        try {
          await auth.deleteUser(user.uid);
          console.log(`[DEL] Deleted Auth user: ${user.uid} (${user.email ?? "no email"})`);
          deletedAuthUsers.push(user.uid);
        } catch (e) {
          console.error(`[ERR] Failed to delete Auth user ${user.uid}:`, e);
        }
      }
    }
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  // -------------------------------------------------------------------------
  // 4) Firestore: Delete sites not owned by SAFE_UIDS (recursive)
  // -------------------------------------------------------------------------
  const deletedSiteIds: string[] = [];

  for (const { siteId } of sitesToDelete) {
    if (protectedSiteIds.has(siteId)) continue; // double-check
    const siteRef = db.collection("sites").doc(siteId);
    if (DRY_RUN) {
      console.log(`[DRY] Would recursiveDelete Firestore: sites/${siteId}`);
    } else {
      try {
        await db.recursiveDelete(siteRef);
        console.log(`[DEL] Deleted Firestore site: ${siteId}`);
        deletedSiteIds.push(siteId);
      } catch (e) {
        console.error(`[ERR] Failed to delete site ${siteId}:`, e);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5) Firestore: Delete tenants where ownerUid not in SAFE_UIDS
  // (Keep tenants that reference SAFE_SITE_IDS)
  // -------------------------------------------------------------------------
  const tenantsSnap = await db.collection("tenants").get();
  const tenantsToDelete: string[] = [];

  for (const doc of tenantsSnap.docs) {
    const data = doc.data();
    const siteId = (data?.siteId ?? "") as string;
    if (SAFE_SITE_IDS.has(siteId)) continue;
    const ownerUid = (data?.ownerUid ?? "") as string;
    if (!safeSet.has(ownerUid)) {
      tenantsToDelete.push(doc.id);
    }
  }

  for (const slug of tenantsToDelete) {
    if (DRY_RUN) {
      console.log(`[DRY] Would delete tenant: tenants/${slug}`);
    } else {
      try {
        await db.collection("tenants").doc(slug).delete();
        console.log(`[DEL] Deleted tenant: ${slug}`);
      } catch (e) {
        console.error(`[ERR] Failed to delete tenant ${slug}:`, e);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6) Firestore: Delete users docs (uid not in SAFE_UIDS)
  // -------------------------------------------------------------------------
  const usersSnap = await db.collection("users").get();
  const usersToDelete: string[] = [];

  for (const doc of usersSnap.docs) {
    if (!safeSet.has(doc.id)) {
      usersToDelete.push(doc.id);
    }
  }

  for (const uid of usersToDelete) {
    if (DRY_RUN) {
      console.log(`[DRY] Would delete user doc: users/${uid}`);
    } else {
      try {
        await db.collection("users").doc(uid).delete();
        console.log(`[DEL] Deleted user doc: ${uid}`);
      } catch (e) {
        console.error(`[ERR] Failed to delete user doc ${uid}:`, e);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7) Firestore: Delete rateLimits, securityEvents, websites (non-protected)
  // -------------------------------------------------------------------------
  const rateLimitsSnap = await db.collection("rateLimits").get();
  for (const doc of rateLimitsSnap.docs) {
    if (DRY_RUN) {
      console.log(`[DRY] Would delete rateLimit: rateLimits/${doc.id}`);
    } else {
      try {
        await doc.ref.delete();
      } catch (e) {
        console.error(`[ERR] Failed to delete rateLimit ${doc.id}:`, e);
      }
    }
  }
  if (rateLimitsSnap.size > 0 && !DRY_RUN) {
    console.log(`[DEL] Deleted ${rateLimitsSnap.size} rateLimit docs`);
  }

  const securitySnap = await db.collection("securityEvents").get();
  for (const doc of securitySnap.docs) {
    if (DRY_RUN) {
      // Skip logging each - too verbose
    } else {
      try {
        await doc.ref.delete();
      } catch {
        // ignore
      }
    }
  }
  if (securitySnap.size > 0 && !DRY_RUN) {
    console.log(`[DEL] Deleted ${securitySnap.size} securityEvents docs`);
  }

  const websitesSnap = await db.collection("websites").get();
  for (const doc of websitesSnap.docs) {
    if (SAFE_SITE_IDS.has(doc.id)) continue;
    const data = doc.data();
    const siteId = (data?.siteId ?? doc.id) as string;
    if (SAFE_SITE_IDS.has(siteId)) continue;
    const ownerUserId = (data?.ownerUserId ?? "") as string;
    if (safeSet.has(ownerUserId)) continue;
    if (DRY_RUN) {
      console.log(`[DRY] Would delete website: websites/${doc.id}`);
    } else {
      try {
        await doc.ref.delete();
        console.log(`[DEL] Deleted website: ${doc.id}`);
      } catch (e) {
        console.error(`[ERR] Failed to delete website ${doc.id}:`, e);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 8) Storage: Delete folders for non-protected sites
  // -------------------------------------------------------------------------
  const deletedStorageFolders: string[] = [];
  try {
    const { getAdminStorageBucket } = await import("../lib/firebaseAdmin");
    const bucket = getAdminStorageBucket();
    const prefixes = ["sites/", "logos/"];

    for (const basePrefix of prefixes) {
      const [files] = await bucket.getFiles({ prefix: basePrefix });
      const bySiteId = new Map<string, string[]>();
      for (const file of files) {
        const name = file.name;
        const parts = name.split("/");
        const siteId = parts[1]; // sites/{siteId}/... or logos/{siteId}/...
        if (!siteId) continue;
        const list = bySiteId.get(siteId) ?? [];
        list.push(name);
        bySiteId.set(siteId, list);
      }
      for (const [siteId, paths] of bySiteId) {
        if (protectedSiteIds.has(siteId) || SAFE_SITE_IDS.has(siteId)) continue;
        const folderPrefix = `${basePrefix}${siteId}/`;
        if (DRY_RUN) {
          console.log(`[DRY] Would delete Storage folder: ${folderPrefix} (${paths.length} files)`);
          deletedStorageFolders.push(folderPrefix);
        } else {
          for (const filePath of paths) {
            const f = bucket.file(filePath);
            await f.delete();
          }
          console.log(`[DEL] Deleted Storage: ${folderPrefix} (${paths.length} files)`);
          deletedStorageFolders.push(folderPrefix);
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("FIREBASE_STORAGE_BUCKET") || msg.includes("not set")) {
      console.log("[INFO] FIREBASE_STORAGE_BUCKET not set - skipping Storage cleanup");
    } else {
      console.error("[ERR] Storage cleanup failed:", e);
    }
  }

  // -------------------------------------------------------------------------
  // 9) Final summary
  // -------------------------------------------------------------------------
  console.log("\n" + "=".repeat(70));
  if (DRY_RUN) {
    console.log("DRY RUN complete. No changes made.");
    console.log("To execute: npx tsx scripts/cleanSlate.ts --execute");
  } else {
    console.log("Clean slate complete. Protected users and their tenants preserved.");
    console.log(`  - Deleted Auth users: ${deletedAuthUsers.length}`);
    console.log(`  - Deleted Firestore sites: ${deletedSiteIds.length}`);
    console.log(`  - Deleted Storage folders: ${deletedStorageFolders.length}`);
  }
  console.log("=".repeat(70) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
