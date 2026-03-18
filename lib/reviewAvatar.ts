import type { ReviewItem } from "@/types/siteConfig";

/**
 * Resolve profile image URL for a review (Firestore / legacy field names).
 */
export function resolveReviewAvatarUrl(review: ReviewItem | Record<string, unknown>): string | null {
  const r = review as Record<string, unknown>;
  const candidates = [r.avatarUrl, r.avatar_url, r.photoUrl, r.imageUrl, r.avatar, r.profileImageUrl];
  const nested = r.profileImage;
  if (nested && typeof nested === "object" && typeof (nested as { url?: string }).url === "string") {
    const u = String((nested as { url: string }).url).trim();
    if (u) return u.startsWith("//") ? `https:${u}` : u;
  }
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const s = c.trim();
    if (!s) continue;
    if (s.startsWith("//")) return `https:${s}`;
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("/")) return s;
    return s;
  }
  return null;
}
