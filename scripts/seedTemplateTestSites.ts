/**
 * Seed Firestore with fixed template QA sites: test-barber, test-nails.
 *
 * Requires Firebase Admin credentials (.env.local — same as other scripts).
 *
 * Safety:
 *   - Allowed when NODE_ENV=development, OR
 *   - When SEED_TEMPLATE_TEST_SITES=1 (explicit opt-in, e.g. staging/prod once).
 *
 * Usage:
 *   npm run seed-template-test-sites
 *   SEED_TEMPLATE_TEST_SITES=1 npx tsx scripts/seedTemplateTestSites.ts
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

function isAllowed(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.SEED_TEMPLATE_TEST_SITES === "1") return true;
  return false;
}

async function main() {
  if (!isAllowed()) {
    console.error(
      "[seed-template-test-sites] Refusing to run.\n" +
        "  Use: npm run seed-template-test-sites (with NODE_ENV=development),\n" +
        "  or: SEED_TEMPLATE_TEST_SITES=1 npx tsx scripts/seedTemplateTestSites.ts"
    );
    process.exit(1);
  }

  const { runSeedTemplateTestSites } = await import("@/lib/seedTemplateTestSitesServer");
  console.log("[seed-template-test-sites] Writing test-barber + test-nails…");
  const result = await runSeedTemplateTestSites();
  console.log("[seed-template-test-sites] Done.", result.paths.join("\n  "));
  console.log(
    "\nOpen locally:\n" +
      "  http://localhost:3000/site/test-barber\n" +
      "  http://localhost:3000/site/test-nails\n" +
      "Booking:\n" +
      "  http://localhost:3000/site/test-barber/book\n" +
      "  http://localhost:3000/site/test-nails/book\n"
  );
}

main().catch((e) => {
  console.error("[seed-template-test-sites] Failed:", e);
  process.exit(1);
});
