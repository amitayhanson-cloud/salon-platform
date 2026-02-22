/**
 * Smoke test: verify template refactor works
 *
 * 1. Fetches templates/hair1 and checks it has required fields
 * 2. Verifies no code references amitay-hair-mk6krumy at runtime (static check)
 *
 * Usage:
 *   npx tsx scripts/verifyTemplateRefactor.ts
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH in .env.local
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  console.log("\n[verifyTemplateRefactor] 1. Checking templates/hair1...");

  const { getTemplate } = await import("../lib/firestoreTemplatesServer");

  try {
    const template = await getTemplate("hair1");
    if (!template.configDefaults || typeof template.configDefaults !== "object") {
      throw new Error("Template has no configDefaults");
    }
    console.log(`[OK] templates/hair1 exists, configDefaults keys: ${Object.keys(template.configDefaults).join(", ")}`);
  } catch (err) {
    console.error("[FAIL] templates/hair1:", err);
    console.log("Run: npm run create-hair1-template");
    process.exit(1);
  }

  console.log("\n[verifyTemplateRefactor] 2. Checking for amitay-hair-mk6krumy in runtime code...");
  const fs = await import("fs");
  const runtimePaths = [
    "lib/firestoreSites.ts",
    "lib/initializeUserSite.ts",
    "app/api/onboarding/complete/route.ts",
    "app/api/create-website/route.ts",
  ];
  let found = false;
  for (const p of runtimePaths) {
    const fullPath = path.join(process.cwd(), p);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf8");
      if (content.includes("amitay-hair-mk6krumy")) {
        console.error(`[FAIL] ${p} still references amitay-hair-mk6krumy`);
        found = true;
      }
    }
  }
  if (found) {
    process.exit(1);
  }
  console.log("[OK] No runtime code references amitay-hair-mk6krumy");

  console.log("\n[verifyTemplateRefactor] Done. Template refactor verified.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
