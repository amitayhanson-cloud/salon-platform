import { NextRequest, NextResponse } from "next/server";
import { createWebsiteDocumentServer, updateUserSiteIdServer } from "@/lib/firestoreUsersServer";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getTemplateConfigDefaults } from "@/lib/firestoreTemplatesServer";
import { mergeTemplateWithBuilderConfig } from "@/lib/mergeTemplateConfig";
import { defaultSiteConfig } from "@/types/siteConfig";
import { DEFAULT_HAIR_TEMPLATE_KEY } from "@/types/template";
import { validateSlug } from "@/lib/slug";
import { getSitePublicUrl } from "@/lib/tenant";

const TENANTS_COLLECTION = "tenants";

function generateSlugFromName(salonName: string): string {
  const base = salonName
    ? salonName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 30)
    : "";
  if (base.length >= 3) return base;
  return `salon-${Math.random().toString(36).substring(2, 8)}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId, salonName, slug: rawSlug } = body as {
      userId?: string;
      salonName?: string;
      slug?: string;
    };

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    let slug: string;

    if (typeof rawSlug === "string" && rawSlug.trim()) {
      const validation = validateSlug(rawSlug);
      if (!validation.ok) {
        return NextResponse.json(
          { success: false, error: validation.error },
          { status: 400 }
        );
      }
      slug = validation.normalized;
      const existingTenant = await db.collection(TENANTS_COLLECTION).doc(slug).get();
      if (existingTenant.exists) {
        return NextResponse.json(
          { success: false, error: "This subdomain is already taken." },
          { status: 409 }
        );
      }
    } else {
      let candidate = generateSlugFromName(salonName ?? "");
      let resolvedSlug: string | null = null;
      for (let attempts = 0; attempts < 10; attempts++) {
        const validation = validateSlug(candidate);
        if (validation.ok) {
          const slugToUse = validation.normalized;
          const exists = await db.collection(TENANTS_COLLECTION).doc(slugToUse).get();
          if (!exists.exists) {
            resolvedSlug = slugToUse;
            break;
          }
        }
        candidate = `salon-${Math.random().toString(36).substring(2, 8)}`;
      }
      if (!resolvedSlug) {
        return NextResponse.json(
          { success: false, error: "Could not generate a unique slug." },
          { status: 500 }
        );
      }
      slug = resolvedSlug;
    }

    let websiteId: string;
    try {
      const website = await createWebsiteDocumentServer(userId, slug, "luxury");
      websiteId = website.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Subdomain already taken")) {
        return NextResponse.json(
          { success: false, error: "Subdomain already taken (websites)." },
          { status: 409 }
        );
      }
      throw err;
    }

    await updateUserSiteIdServer(userId, websiteId);

    const siteId = websiteId;
    const now = new Date();
    let initialConfig = {
      ...defaultSiteConfig,
      salonName: salonName || "הסלון שלי",
    };

    try {
      const templateDefaults = await getTemplateConfigDefaults(DEFAULT_HAIR_TEMPLATE_KEY);
      initialConfig = mergeTemplateWithBuilderConfig(templateDefaults, initialConfig);
    } catch (err) {
      console.warn("[create-website] Template not found, using defaults:", err);
    }

    const siteRef = db.collection("sites").doc(siteId);
    const tenantRef = db.collection(TENANTS_COLLECTION).doc(slug);
    const batch = db.batch();
    batch.set(siteRef, {
      ...initialConfig,
      ownerUid: userId,
      ownerUserId: userId,
      slug,
      businessType: "hair",
      templateKey: DEFAULT_HAIR_TEMPLATE_KEY,
      templateSource: `templates/${DEFAULT_HAIR_TEMPLATE_KEY}`,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(tenantRef, {
      siteId,
      ownerUid: userId,
      createdAt: now,
      updatedAt: now,
    });
    await batch.commit();

    const publicUrl = getSitePublicUrl(slug);

    return NextResponse.json({
      success: true,
      siteId,
      subdomain: slug,
      slug,
      publicUrl,
    });
  } catch (err) {
    console.error("Error creating website:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
