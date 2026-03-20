/**
 * Server-only: create site + tenant + user + booking settings (builder onboarding).
 * Used by /api/onboarding/complete and /api/onboarding/complete-from-session.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getTemplateConfigDefaults } from "@/lib/firestoreTemplatesServer";
import { mergeTemplateWithBuilderConfig } from "@/lib/mergeTemplateConfig";
import { generateDemoFaqs, generateDemoReviews } from "@/lib/demoContent";
import { validateSlug } from "@/lib/slug";
import { getSitePublicUrl } from "@/lib/tenant";
import { DEFAULT_HAIR_TEMPLATE_KEY } from "@/types/template";
import type { SiteConfig } from "@/types/siteConfig";
import type { SiteService } from "@/types/siteConfig";
import { defaultBookingSettings, type BookingSettings } from "@/types/bookingSettings";
import { sanitizeForFirestore } from "@/lib/sanitizeForFirestore";

const TENANTS_COLLECTION = "tenants";
const SITES_COLLECTION = "sites";
const USERS_COLLECTION = "users";

export type OnboardingCompleteInput = {
  uid: string;
  slug: string;
  config: SiteConfig;
  services: SiteService[];
  bookingSettings?: BookingSettings;
};

function mergeOnboardingBookingSettings(raw: unknown): BookingSettings {
  if (!raw || typeof raw !== "object") {
    return { ...defaultBookingSettings, days: { ...defaultBookingSettings.days } };
  }
  const rb = raw as Partial<BookingSettings>;
  const daysIn = rb.days && typeof rb.days === "object" ? rb.days : {};
  return {
    ...defaultBookingSettings,
    slotMinutes:
      typeof rb.slotMinutes === "number" && [15, 30, 60].includes(rb.slotMinutes)
        ? rb.slotMinutes
        : defaultBookingSettings.slotMinutes,
    days: { ...defaultBookingSettings.days, ...daysIn },
    closedDates: Array.isArray(rb.closedDates) ? rb.closedDates : defaultBookingSettings.closedDates,
  };
}

export type OnboardingCompleteResult =
  | { ok: true; siteId: string; slug: string; publicUrl: string }
  | { ok: false; status: number; error: string };

/**
 * Validates slug, checks tenant free, runs Firestore batch. Idempotent-safe only if caller checks siteId first.
 */
export async function runOnboardingComplete(
  input: OnboardingCompleteInput
): Promise<OnboardingCompleteResult> {
  const validation = validateSlug(input.slug);
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error };
  }
  const slug = validation.normalized;

  const config = input.config;
  if (!config || typeof config !== "object" || !config.salonName?.trim()) {
    return { ok: false, status: 400, error: "config with salonName is required" };
  }

  const db = getAdminDb();
  const tenantRef = db.collection(TENANTS_COLLECTION).doc(slug);
  const tenantSnap = await tenantRef.get();
  if (tenantSnap.exists) {
    return { ok: false, status: 409, error: "This subdomain is already taken." };
  }

  const siteRef = db.collection(SITES_COLLECTION).doc();
  const siteId = siteRef.id;
  const userRef = db.collection(USERS_COLLECTION).doc(input.uid);
  const now = new Date();

  let finalConfig: SiteConfig = { ...config, slug };
  try {
    const templateDefaults = await getTemplateConfigDefaults(DEFAULT_HAIR_TEMPLATE_KEY);
    finalConfig = mergeTemplateWithBuilderConfig(templateDefaults, finalConfig);
  } catch {
    finalConfig = { ...config, slug };
  }

  const extra = new Set(finalConfig.extraPages ?? []);
  extra.add("faq");
  extra.add("reviews");
  finalConfig = { ...finalConfig, extraPages: Array.from(extra) };
  if (!finalConfig.faqs || finalConfig.faqs.length === 0) {
    finalConfig = { ...finalConfig, faqs: generateDemoFaqs() };
  }
  if (!finalConfig.reviews || finalConfig.reviews.length === 0) {
    finalConfig = { ...finalConfig, reviews: generateDemoReviews() };
  }

  const bookingPayload = sanitizeForFirestore(
    mergeOnboardingBookingSettings(input.bookingSettings)
  ) as Record<string, unknown>;

  const batch = db.batch();
  batch.set(siteRef, {
    ownerUid: input.uid,
    ownerUserId: input.uid,
    config: finalConfig,
    slug,
    services: input.services,
    businessType: "hair",
    templateKey: DEFAULT_HAIR_TEMPLATE_KEY,
    templateSource: `templates/${DEFAULT_HAIR_TEMPLATE_KEY}`,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(tenantRef, {
    siteId,
    ownerUid: input.uid,
    createdAt: now,
    updatedAt: now,
  });
  batch.update(userRef, {
    siteId,
    updatedAt: now,
  });

  const bookingRef = siteRef.collection("settings").doc("booking");
  batch.set(bookingRef, {
    ...bookingPayload,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  const publicUrl = getSitePublicUrl(slug);
  return { ok: true, siteId, slug, publicUrl };
}
