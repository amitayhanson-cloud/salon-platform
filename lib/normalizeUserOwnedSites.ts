/**
 * Merge legacy users/{uid}.siteId with ownedSiteIds[] for multi-site accounts.
 */
export function normalizeOwnedSiteIds(
  rawOwned: unknown,
  siteId: string | null | undefined
): string[] {
  const fromArr = Array.isArray(rawOwned)
    ? rawOwned.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  const set = new Set(fromArr.map((s) => s.trim()));
  const sid = typeof siteId === "string" && siteId.trim() ? siteId.trim() : null;
  if (sid) set.add(sid);
  return Array.from(set);
}
