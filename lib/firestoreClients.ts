import {
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { clientsCollection, clientDoc } from "./firestorePaths";

export interface ClientData {
  id?: string; // phone number (unique identifier)
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  createdAt?: string | Timestamp;
  updatedAt?: string | Timestamp;
  lastVisit?: string; // ISO date string
  totalBookings?: number; // Computed from bookings
}

/**
 * Check if a client with the given phone already exists
 */
export async function checkClientExists(
  siteId: string,
  phone: string
): Promise<{ exists: boolean; clientId?: string; clientData?: ClientData }> {
  try {
    const clientsRef = clientsCollection(siteId);
    const q = query(clientsRef, where("phone", "==", phone));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();
      return {
        exists: true,
        clientId: doc.id,
        clientData: {
          id: doc.id,
          name: data.name || "",
          phone: data.phone || "",
          email: data.email || undefined,
          notes: data.notes || undefined,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || undefined,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || undefined,
        },
      };
    }

    return { exists: false };
  } catch (error) {
    console.error("[checkClientExists] Error checking client", error);
    throw error;
  }
}

/**
 * Create a new client document
 */
export async function createClient(
  siteId: string,
  client: Omit<ClientData, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  try {
    // Normalize phone (remove spaces, dashes, etc.)
    const normalizedPhone = client.phone.replace(/\s|-|\(|\)/g, "");

    // Check if client already exists
    const existing = await checkClientExists(siteId, normalizedPhone);
    if (existing.exists) {
      throw new Error("CLIENT_EXISTS");
    }

    const clientsRef = clientsCollection(siteId);
    const docRef = await addDoc(clientsRef, {
      name: client.name.trim(),
      phone: normalizedPhone,
      email: client.email?.trim() || null,
      notes: client.notes?.trim() || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log("[createClient] Created client", {
      siteId,
      clientId: docRef.id,
      phone: normalizedPhone,
    });

    return docRef.id;
  } catch (error) {
    console.error("[createClient] Error creating client", error);
    throw error;
  }
}

/**
 * Update an existing client document
 */
export async function updateClient(
  siteId: string,
  clientId: string,
  updates: Partial<Omit<ClientData, "id" | "createdAt">>
): Promise<void> {
  try {
    const clientRef = clientDoc(siteId, clientId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };

    if (updates.name !== undefined) {
      updateData.name = updates.name.trim();
    }
    if (updates.phone !== undefined) {
      updateData.phone = updates.phone.replace(/\s|-|\(|\)/g, "");
    }
    if (updates.email !== undefined) {
      updateData.email = updates.email?.trim() || null;
    }
    if (updates.notes !== undefined) {
      updateData.notes = updates.notes?.trim() || null;
    }

    await setDoc(clientRef, updateData, { merge: true });

    console.log("[updateClient] Updated client", {
      siteId,
      clientId,
      updates: Object.keys(updateData),
    });
  } catch (error) {
    console.error("[updateClient] Error updating client", error);
    throw error;
  }
}

/**
 * Get a client by ID
 */
export async function getClient(
  siteId: string,
  clientId: string
): Promise<ClientData | null> {
  try {
    const clientRef = clientDoc(siteId, clientId);
    const snapshot = await getDoc(clientRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return {
      id: snapshot.id,
      name: data.name || "",
      phone: data.phone || "",
      email: data.email || undefined,
      notes: data.notes || undefined,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || undefined,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || undefined,
    };
  } catch (error) {
    console.error("[getClient] Error getting client", error);
    throw error;
  }
}

/**
 * Get all clients from the clients collection
 */
export async function getAllClients(siteId: string): Promise<ClientData[]> {
  try {
    const clientsRef = clientsCollection(siteId);
    const snapshot = await getDocs(clientsRef);

    const clients: ClientData[] = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      clients.push({
        id: doc.id,
        name: data.name || "",
        phone: data.phone || "",
        email: data.email || undefined,
        notes: data.notes || undefined,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || undefined,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || undefined,
      });
    });

    return clients;
  } catch (error) {
    console.error("[getAllClients] Error getting clients", error);
    throw error;
  }
}
