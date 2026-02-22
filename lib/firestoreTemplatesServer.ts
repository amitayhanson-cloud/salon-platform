/**
 * Server-only: read template documents from Firestore.
 * Use in API routes and scripts. Uses Firebase Admin SDK.
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import type { TemplateDoc, TemplateConfigDefaults } from "@/types/template";

const TEMPLATES_COLLECTION = "templates";

/**
 * Get template document by key.
 * Path: templates/{templateKey}
 * @throws Error if template not found
 */
export async function getTemplate(templateKey: string): Promise<TemplateDoc> {
  const db = getAdminDb();
  const ref = db.collection(TEMPLATES_COLLECTION).doc(templateKey);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new Error(
      `Template "${templateKey}" not found. Ensure you have run scripts/createHair1TemplateFromSite.ts to create the template.`
    );
  }

  const data = snap.data() as Record<string, unknown>;
  return {
    businessType: (data.businessType as TemplateDoc["businessType"]) ?? "hair",
    configDefaults: (data.configDefaults as TemplateConfigDefaults) ?? {},
    displayName: typeof data.displayName === "string" ? data.displayName : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
  };
}

/**
 * Get config defaults from a template for merging into a new site.
 * @throws Error if template not found
 */
export async function getTemplateConfigDefaults(
  templateKey: string
): Promise<TemplateConfigDefaults> {
  const template = await getTemplate(templateKey);
  return template.configDefaults ?? {};
}

/**
 * Create a new site from template (server-side).
 * Reads from templates/{templateKey}, merges with builder config, creates site.
 * Does NOT create tenant or update user - caller must do that.
 *
 * @returns The new site document ID
 * @throws Error if template not found
 */
export async function createSiteFromTemplateServer(
  ownerUid: string,
  builderConfig: { config: import("@/types/siteConfig").SiteConfig; services: import("@/types/siteConfig").SiteService[] },
  options: { businessType?: string; templateKey?: string } = {}
): Promise<string> {
  const { mergeTemplateWithBuilderConfig } = await import("./mergeTemplateConfig");
  const { generateDemoFaqs, generateDemoReviews } = await import("./demoContent");

  const templateKey = options.templateKey ?? "hair1";
  const businessType = options.businessType ?? "hair";

  const template = await getTemplate(templateKey);
  const templateDefaults = template.configDefaults ?? {};
  let finalConfig = mergeTemplateWithBuilderConfig(templateDefaults, builderConfig.config);

  // Generate demo FAQs if FAQ page selected and none exist
  if (finalConfig.extraPages?.includes("faq")) {
    const existing = finalConfig.faqs ?? [];
    if (existing.length === 0) {
      finalConfig = { ...finalConfig, faqs: generateDemoFaqs() };
    }
  }

  // Generate demo Reviews if Reviews page selected and none exist
  if (finalConfig.extraPages?.includes("reviews")) {
    const existing = finalConfig.reviews ?? [];
    if (existing.length === 0) {
      finalConfig = { ...finalConfig, reviews: generateDemoReviews() };
    }
  }

  const db = getAdminDb();
  const siteRef = db.collection("sites").doc();
  const now = new Date();

  await siteRef.set({
    ownerUid,
    ownerUserId: ownerUid,
    config: finalConfig,
    services: builderConfig.services ?? [],
    businessType,
    templateKey,
    templateSource: `templates/${templateKey}`,
    createdAt: now,
    updatedAt: now,
    initializedFromTemplate: true,
  });

  console.log(`[createSiteFromTemplateServer] Created site ${siteRef.id} for owner ${ownerUid} (template: ${templateKey})`);
  return siteRef.id;
}
