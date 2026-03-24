import type { Metadata } from "next";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { SiteConfig } from "@/types/siteConfig";
import { isPlatformHost, normalizeHost } from "@/lib/tenant";

const DEFAULT_SALON_NAME = "Salon";
const CALENO_OG_PATH = "/brand/caleno%20logo/caleno_logo_new.png";
/** Stock salon image when tenant has no logo (high-res public asset) */
const DEFAULT_SALON_OG_PATH = "/templates/hair/about/about5.jpg";

function getRequestOrigin(headersList: Headers): string {
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "caleno.co";
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  const hostOnly = host.split(":")[0] ?? host;
  return `${proto}://${hostOnly}`;
}

function toAbsoluteAssetUrl(origin: string, pathOrUrl: string): string {
  if (!pathOrUrl) return `${origin}${CALENO_OG_PATH}`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${origin}${path}`;
}

function canonicalBookingUrl(origin: string, siteId: string, hostHeader: string): string {
  const host = normalizeHost(hostHeader);
  /** Tenant subdomain, custom domain, etc. — public path is `/book` (proxy rewrites to /site/[siteId]/book). */
  if (host && !isPlatformHost(host)) {
    return `${origin}/book`;
  }
  return `${origin}/site/${encodeURIComponent(siteId)}/book`;
}

/**
 * Open Graph / Twitter metadata for the public booking page.
 * Uses Admin SDK (same as root layout) so it works on the server without client Firebase.
 */
export async function buildBookingPageMetadata(
  siteId: string,
  headersList: Headers
): Promise<Metadata> {
  const origin = getRequestOrigin(headersList);
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";

  let siteName = DEFAULT_SALON_NAME;
  let logoUrl: string | null = null;
  let customDescription: string | null = null;

  try {
    const db = getAdminDb();
    const snap = await db.collection("sites").doc(siteId).get();
    if (snap.exists) {
      const cfg = (snap.data()?.config ?? {}) as Partial<SiteConfig>;
      if (cfg.salonName?.trim()) siteName = cfg.salonName.trim();
      logoUrl = cfg.branding?.logoUrl?.trim() || null;
      const about = cfg.content?.about?.body?.trim();
      const note = cfg.specialNote?.trim();
      if (about) customDescription = about.slice(0, 200);
      else if (note) customDescription = note.slice(0, 200);
    }
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[buildBookingPageMetadata] Firestore admin unavailable or read failed:", e);
    }
  }

  const title = `${siteName} - Book an Appointment`;
  const description =
    customDescription?.trim() ||
    `Book your next appointment at ${siteName} via Caleno.`;

  const ogImage = logoUrl
    ? toAbsoluteAssetUrl(origin, logoUrl)
    : `${origin}${DEFAULT_SALON_OG_PATH}`;

  const canonical = canonicalBookingUrl(origin, siteId, host);

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: "Caleno",
      images: [
        {
          url: ogImage,
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}
