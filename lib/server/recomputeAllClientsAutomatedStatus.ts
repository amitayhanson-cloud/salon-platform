import { Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { calculateAutomatedClientStatus } from "@/lib/clientStatusEngine";
import type { ClientStatusRules } from "@/types/clientStatus";
import { fetchBookingsForClientStatus } from "@/lib/server/clientAutomatedStatus";

/** Recompute and persist `currentStatus` for every client on the site. */
export async function recomputeAllClientsAutomatedStatus(
  db: Firestore,
  siteId: string,
  statusRules: ClientStatusRules
): Promise<number> {
  const siteRef = db.collection("sites").doc(siteId);
  const clientsSnap = await siteRef.collection("clients").get();
  const ts = Timestamp.now();
  let updatedClients = 0;
  for (const clientDoc of clientsSnap.docs) {
    const clientDocId = clientDoc.id.trim();
    if (!clientDocId) continue;
    const bookings = await fetchBookingsForClientStatus(db, siteId, clientDocId);
    const currentStatus = calculateAutomatedClientStatus(bookings, statusRules);
    await clientDoc.ref.set({ currentStatus, currentStatusUpdatedAt: ts }, { merge: true });
    updatedClients += 1;
  }
  return updatedClients;
}
