/**
 * Server-only: Waze URL from sites/{siteId}.config.address.
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildWazeUrlFromAddress } from "@/lib/whatsapp/businessWaze";

export async function fetchWazeUrlForSite(siteId: string): Promise<string> {
  const db = getAdminDb();
  const snap = await db.collection("sites").doc(siteId).get();
  const addr = snap.data()?.config?.address;
  return buildWazeUrlFromAddress(typeof addr === "string" ? addr : undefined);
}
