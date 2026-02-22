/**
 * Create hair1 template from existing site amitay-hair-mk6krumy
 *
 * Reads website-related presentation fields from sites/amitay-hair-mk6krumy
 * and writes them to templates/hair1.
 *
 * Usage:
 *   npx tsx scripts/createHair1TemplateFromSite.ts
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH in .env.local
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SOURCE_SITE_ID = "amitay-hair-mk6krumy";
const TEMPLATE_KEY = "hair1";
const TEMPLATES_COLLECTION = "templates";

async function main() {
  console.log(`\n[createHair1TemplateFromSite] Reading from sites/${SOURCE_SITE_ID}...`);

  const { getAdminDb } = await import("../lib/firebaseAdmin");
  const db = getAdminDb();

  const siteRef = db.collection("sites").doc(SOURCE_SITE_ID);
  const siteSnap = await siteRef.get();

  if (!siteSnap.exists) {
    throw new Error(
      `Source site ${SOURCE_SITE_ID} not found. Ensure it exists in Firestore before running this script.`
    );
  }

  const siteData = siteSnap.data() as Record<string, unknown>;
  const config = siteData?.config as Record<string, unknown> | undefined;

  if (!config || typeof config !== "object") {
    throw new Error(`Source site ${SOURCE_SITE_ID} has no config.`);
  }

  // Extract only website presentation defaults (no tenant-specific data)
  const configDefaults: Record<string, unknown> = {};

  const presentationFields = [
    "themeColors",
    "heroImage",
    "aboutImage",
    "dividerStyle",
    "dividerHeight",
    "extraPages",
    "vibe",
    "photosOption",
    "contactOptions",
    "mainGoals",
  ] as const;

  for (const field of presentationFields) {
    const val = config[field];
    if (val !== undefined && val !== null) {
      configDefaults[field] = val;
    }
  }

  const now = new Date().toISOString();
  const templateDoc = {
    businessType: "hair",
    configDefaults,
    displayName: "Hair Luxury (hair1)",
    createdAt: now,
    updatedAt: now,
  };

  const templateRef = db.collection(TEMPLATES_COLLECTION).doc(TEMPLATE_KEY);
  await templateRef.set(templateDoc);

  console.log(`[createHair1TemplateFromSite] Wrote templates/${TEMPLATE_KEY}`);
  console.log(`[createHair1TemplateFromSite] configDefaults keys: ${Object.keys(configDefaults).join(", ")}`);
  console.log(`[createHair1TemplateFromSite] Done.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
