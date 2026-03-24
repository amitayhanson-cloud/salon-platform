import type { Metadata } from "next";

export function getRequestOriginFromHeaders(headersList: Headers): string {
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "caleno.co";
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  const hostOnly = host.split(":")[0] ?? host;
  return `${proto}://${hostOnly}`;
}

export function toAbsoluteAssetUrlFromOrigin(origin: string, pathOrUrl: string): string {
  if (!pathOrUrl) return origin;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${origin}${path}`;
}

function inferFaviconMimeType(absoluteUrl: string): string | undefined {
  const path = absoluteUrl.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".ico")) return "image/x-icon";
  return undefined;
}

export function calenoDefaultIcons(): NonNullable<Metadata["icons"]> {
  return {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  };
}

/** Use salon logo as favicon / apple touch (absolute https URL). */
export function tenantIconsFromLogoAbsoluteUrl(absoluteLogoUrl: string): NonNullable<Metadata["icons"]> {
  const type = inferFaviconMimeType(absoluteLogoUrl);
  const iconDesc = type ? { url: absoluteLogoUrl, type } : { url: absoluteLogoUrl };
  return {
    icon: [iconDesc],
    shortcut: absoluteLogoUrl,
    apple: absoluteLogoUrl,
  };
}
