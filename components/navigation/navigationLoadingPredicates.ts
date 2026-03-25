/** True for tenant admin routes on any host (/admin… or /site/x/admin…). */
export function isAdminAppPath(pathname: string): boolean {
  return /\/admin(\/|$)/.test(pathname);
}

export function adminNavigationPredicate(nextUrl: URL): boolean {
  return isAdminAppPath(nextUrl.pathname);
}

/** Public salon pages: any in-app nav except admin. */
export function tenantPublicNavigationPredicate(nextUrl: URL): boolean {
  return !isAdminAppPath(nextUrl.pathname);
}

/** Salon site (public + admin): show overlay for in-app navigations (not /api). */
export function tenantSiteNavigationPredicate(nextUrl: URL): boolean {
  const p = nextUrl.pathname;
  if (p.startsWith("/api") || p.startsWith("/_next")) return false;
  return true;
}

/** Caleno marketing / account pages on the platform host. */
export function marketingNavigationPredicate(nextUrl: URL): boolean {
  const p = nextUrl.pathname;
  if (p.startsWith("/api") || p.startsWith("/_next")) return false;
  return true;
}
