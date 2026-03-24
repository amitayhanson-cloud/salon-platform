import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ConsentPopup } from "@/components/legal/ConsentPopup";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";
import { getHostKind, isPlatformHost, normalizeHost } from "@/lib/tenant";
import { getTenantSiteId } from "@/lib/tenant-data";
import { getSiteIdByDomain } from "@/lib/firestoreCustomDomain";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  calenoDefaultIcons,
  tenantIconsFromLogoAbsoluteUrl,
} from "@/lib/metadataTenantIcons";

const ROOT_METADATA: Metadata = {
  title: "Caleno | מערכת ניהול מתקדמת לעסקים – זימון תורים ובניית אתרים",
  description:
    "פלטפורמה אחת לניהול העסק שלך: אתר מקצועי, מערכת זימון תורים, ניהול לקוחות ותזכורות אוטומטיות. מתאים לעסקים קטנים.",
};

const DEFAULT_METADATA: Metadata = {
  title: "Caleno - בונים אתר מושלם לסלון שלך בדקות",
  description:
    "בונים אתר מקצועי לסלון שלך ללא צורך בידע טכני. מתאים לספריות, מכוני יופי וספא.",
};

function getOriginFromHeaders(headersList: Headers): string {
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "caleno.co";
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function toAbsoluteUrl(origin: string, urlLike: string): string {
  if (!urlLike) return `${origin}/brand/caleno%20logo/caleno_logo_new.png`;
  if (/^https?:\/\//i.test(urlLike)) return urlLike;
  const path = urlLike.startsWith("/") ? urlLike : `/${urlLike}`;
  return `${origin}${path}`;
}

type SiteMetaInfo = {
  salonName: string;
  description: string;
  imageUrl: string;
  /** Absolute logo URL for favicon only when tenant uploaded a logo; otherwise null → Caleno favicon */
  faviconUrl: string | null;
};

async function getSiteMetaInfoForHost(hostHeader: string, origin: string): Promise<SiteMetaInfo | null> {
  const host = normalizeHost(hostHeader);
  if (!host || isPlatformHost(host)) return null;

  let siteId: string | null = null;
  const hostKind = getHostKind(host);
  if (hostKind.kind === "tenant") {
    siteId = await getTenantSiteId(hostKind.slug);
  } else {
    siteId = await getSiteIdByDomain(host);
  }
  if (!siteId) return null;

  const siteSnap = await getAdminDb().collection("sites").doc(siteId).get();
  if (!siteSnap.exists) return null;

  const siteData = siteSnap.data() as {
    config?: {
      salonName?: string;
      content?: { about?: { body?: string } };
      branding?: { logoUrl?: string | null };
    };
  } | null;

  const salonName = siteData?.config?.salonName?.trim() || "Business";
  const aboutText = siteData?.config?.content?.about?.body?.trim() ?? "";
  const description =
    aboutText ||
    (salonName !== "Business"
      ? `Book your next appointment at ${salonName} via Caleno.`
      : "Schedule your next visit easily online.");
  const rawLogo = siteData?.config?.branding?.logoUrl?.trim() || "";
  const imageUrl = toAbsoluteUrl(origin, rawLogo);
  const faviconUrl = rawLogo ? toAbsoluteUrl(origin, rawLogo) : null;

  return { salonName, description, imageUrl, faviconUrl };
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const origin = getOriginFromHeaders(headersList);
  const isRoot = isPlatformHost(host);
  const siteMeta = isRoot ? null : await getSiteMetaInfoForHost(host, origin).catch(() => null);

  if (siteMeta) {
    /** Booking page sets its own title via `app/(site)/site/[siteId]/book/layout.tsx` */
    const title = `${siteMeta.salonName} · Caleno`;
    const description = siteMeta.description || "Schedule your next visit easily online.";
    return {
      metadataBase: new URL(origin),
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        images: [{ url: siteMeta.imageUrl }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [siteMeta.imageUrl],
      },
      icons: siteMeta.faviconUrl
        ? tenantIconsFromLogoAbsoluteUrl(siteMeta.faviconUrl)
        : calenoDefaultIcons(),
    };
  }

  return {
    ...(isRoot ? ROOT_METADATA : DEFAULT_METADATA),
    metadataBase: new URL(origin),
    icons: calenoDefaultIcons(),
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen w-full overflow-x-hidden overscroll-none bg-white text-slate-900 antialiased">
        <AuthProvider>
          <ConsentPopup />
          <CookieConsentBanner />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
