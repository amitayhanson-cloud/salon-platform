/**
 * Public marketing social links (landing / waitlist). Override via env on Vercel.
 */
export function getMarketingSocialUrls(): { instagram: string; tiktok: string } {
  const instagram =
    process.env.NEXT_PUBLIC_CALENO_INSTAGRAM_URL?.trim() || "https://www.instagram.com/";
  const tiktok = process.env.NEXT_PUBLIC_CALENO_TIKTOK_URL?.trim() || "https://www.tiktok.com/";
  return { instagram, tiktok };
}
