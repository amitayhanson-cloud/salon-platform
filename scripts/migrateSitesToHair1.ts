/**
 * Migrate existing sites to hair1 template metadata
 *
 * Updates metadata on all sites:
 * - businessType: "hair" (if missing)
 * - templateKey: "hair1"
 * - templateSource: "templates/hair1" (metadata only; remove tenant site reference)
 *
 * IMPORTANT: Does NOT re-seed or overwrite per-site customizations.
 * Only updates the metadata fields.
 *
 * Usage:
 *   npx tsx scripts/migrateSitesToHair1.ts          # dry run
 *   npx tsx scripts/migrateSitesToHair1.ts --execute # apply changes
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH in .env.local
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--execute");
const TEMPLATE_KEY = "hair1";

async function main() {
  console.log("\n" + "=".repeat(60));
  if (DRY_RUN) {
    console.log("  migrateSitesToHair1 - DRY RUN (no changes)");
    console.log("  To execute: npx tsx scripts/migrateSitesToHair1.ts --execute");
  } else {
    console.log("  migrateSitesToHair1 - EXECUTING");
  }
  console.log("=".repeat(60) + "\n");

  const { getAdminDb } = await import("../lib/firebaseAdmin");
  const db = getAdminDb();

  const sitesSnap = await db.collection("sites").get();
  const updates: { siteId: string; data: Record<string, unknown> }[] = [];

  for (const doc of sitesSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const updatesForSite: Record<string, unknown> = {};

    // businessType
    if (!data.businessType || data.businessType !== "hair") {
      updatesForSite.businessType = "hair";
    }

    // templateKey
    if (!data.templateKey || data.templateKey !== TEMPLATE_KEY) {
      updatesForSite.templateKey = TEMPLATE_KEY;
    }

    // templateSource: set to templates reference (removes amitay-hair-mk6krumy dependency)
    const desiredSource = `templates/${TEMPLATE_KEY}`;
    if (data.templateSource !== desiredSource) {
      updatesForSite.templateSource = desiredSource;
    }

    // updatedAt
    if (Object.keys(updatesForSite).length > 0) {
      updatesForSite.updatedAt = new Date();
      updates.push({ siteId: doc.id, data: updatesForSite });
    }
  }

  console.log(`[migrateSitesToHair1] Sites to update: ${updates.length}`);

  for (const { siteId, data } of updates) {
    if (DRY_RUN) {
      console.log(`[DRY] Would update sites/${siteId}:`, data);
    } else {
      await db.collection("sites").doc(siteId).update(data);
      console.log(`[OK] Updated sites/${siteId}`);
    }
  }

  console.log(`\n[migrateSitesToHair1] Done. ${updates.length} sites ${DRY_RUN ? "would be" : ""} updated.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
