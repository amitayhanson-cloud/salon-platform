import {
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { clientsCollection, clientDoc } from "./firestorePaths";

export interface ClientData {
  id?: string; // Firestore-generated document ID (NOT phone number)
  name: string;
  phone: string; // Phone number is a field, NOT the document ID
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
 * Get or create a client by phone number
 * This is the single source of truth for client creation during booking
 * - Searches for existing client by phone
 * - Creates new client only if not found
 * - Always uses Firestore-generated document ID (never phone as ID)
 */
export async function getOrCreateClient(
  siteId: string,
  clientData: { name: string; phone: string; email?: string; notes?: string }
): Promise<string> {
  try {
    // Normalize phone (remove spaces, dashes, etc.)
    const normalizedPhone = clientData.phone.replace(/\s|-|\(|\)/g, "");

    // Check if client already exists
    const existing = await checkClientExists(siteId, normalizedPhone);
    if (existing.exists && existing.clientId) {
      // Client exists - update name/email if provided and different
      if (existing.clientData) {
        const needsUpdate = 
          (clientData.name.trim() && existing.clientData.name !== clientData.name.trim()) ||
          (clientData.email && existing.clientData.email !== clientData.email) ||
          (clientData.notes && existing.clientData.notes !== clientData.notes);

        if (needsUpdate) {
          await updateClient(siteId, existing.clientId, {
            name: clientData.name.trim() || existing.clientData.name,
            email: clientData.email || existing.clientData.email,
            notes: clientData.notes || existing.clientData.notes,
          });
        }
      }
      
      console.log("[getOrCreateClient] Found existing client", {
        siteId,
        clientId: existing.clientId,
        phone: normalizedPhone,
      });
      
      return existing.clientId;
    }

    // Client doesn't exist - create new one with Firestore-generated ID
    const clientsRef = clientsCollection(siteId);
    const docRef = await addDoc(clientsRef, {
      name: clientData.name.trim(),
      phone: normalizedPhone,
      email: clientData.email?.trim() || null,
      notes: clientData.notes?.trim() || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log("[getOrCreateClient] Created new client", {
      siteId,
      clientId: docRef.id,
      phone: normalizedPhone,
    });

    return docRef.id;
  } catch (error) {
    console.error("[getOrCreateClient] Error getting/creating client", error);
    throw error;
  }
}

/**
 * Create a new client document
 * @deprecated Use getOrCreateClient instead to prevent duplicates
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

/**
 * Check if a document ID looks like a phone number
 * Phone numbers typically contain only digits, may have + prefix
 */
function isPhoneNumberId(docId: string): boolean {
  // Remove common phone prefixes and check if remaining is mostly digits
  const cleaned = docId.replace(/^\+/, "").replace(/\s|-|\(|\)/g, "");
  // If it's 7+ digits and doesn't look like a Firestore ID (which has letters), it's likely a phone
  return /^\d{7,}$/.test(cleaned) && docId.length >= 7 && docId.length <= 20;
}

/**
 * Migrate client documents that use phone numbers as document IDs
 * This function:
 * 1. Finds documents with phone-number IDs
 * 2. Searches for existing client by phone (with generated ID)
 * 3. Merges data from phone-number-keyed doc into correct doc
 * 4. Deletes the phone-number-keyed document
 * 
 * IMPORTANT: This should NOT run automatically in production
 * Run this manually via admin tool or migration script
 */
export async function migratePhoneNumberClientIds(siteId: string): Promise<{
  migrated: number;
  deleted: number;
  errors: Array<{ docId: string; error: string }>;
}> {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_CLIENT_MIGRATION) {
    throw new Error("Client migration is disabled in production. Set ALLOW_CLIENT_MIGRATION=true to enable.");
  }

  const results = {
    migrated: 0,
    deleted: 0,
    errors: [] as Array<{ docId: string; error: string }>,
  };

  try {
    const clientsRef = clientsCollection(siteId);
    const snapshot = await getDocs(clientsRef);

    // Find all documents with phone-number IDs
    const phoneNumberDocs = snapshot.docs.filter((doc) => isPhoneNumberId(doc.id));

    console.log(`[migratePhoneNumberClientIds] Found ${phoneNumberDocs.length} documents with phone-number IDs`);

    for (const phoneDoc of phoneNumberDocs) {
      try {
        const phoneData = phoneDoc.data();
        const phoneNumber = phoneData.phone || phoneDoc.id; // Use phone field or doc ID
        const normalizedPhone = phoneNumber.replace(/\s|-|\(|\)/g, "");

        // Search for existing client with generated ID
        const existing = await checkClientExists(siteId, normalizedPhone);

        if (existing.exists && existing.clientId) {
          // Merge data from phone-number doc into correct doc
          const mergeData: Partial<ClientData> = {};
          
          // Merge name if phone-number doc has it and correct doc doesn't
          if (phoneData.name && (!existing.clientData?.name || existing.clientData.name.trim() === "")) {
            mergeData.name = phoneData.name;
          }
          
          // Merge email if phone-number doc has it
          if (phoneData.email && !existing.clientData?.email) {
            mergeData.email = phoneData.email;
          }
          
          // Merge notes (combine if both exist)
          if (phoneData.notes) {
            const existingNotes = existing.clientData?.notes || "";
            mergeData.notes = existingNotes 
              ? `${existingNotes}\n\n[מעבר ממיזוג]: ${phoneData.notes}`
              : phoneData.notes;
          }

          // Update the correct client document
          if (Object.keys(mergeData).length > 0) {
            await updateClient(siteId, existing.clientId, mergeData);
            console.log(`[migratePhoneNumberClientIds] Merged data from phone-number doc ${phoneDoc.id} into ${existing.clientId}`);
          }

          // Delete the phone-number-keyed document
          await deleteDoc(phoneDoc.ref);
          results.deleted++;
          results.migrated++;

          console.log(`[migratePhoneNumberClientIds] Deleted phone-number-keyed document ${phoneDoc.id}`);
        } else {
          // No existing client found - convert phone-number doc to proper format
          // Create new document with generated ID
          const newDocRef = await addDoc(clientsRef, {
            name: phoneData.name || "",
            phone: normalizedPhone,
            email: phoneData.email || null,
            notes: phoneData.notes || null,
            createdAt: phoneData.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // Delete the phone-number-keyed document
          await deleteDoc(phoneDoc.ref);
          results.deleted++;
          results.migrated++;

          console.log(`[migratePhoneNumberClientIds] Converted phone-number doc ${phoneDoc.id} to generated ID ${newDocRef.id}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.errors.push({ docId: phoneDoc.id, error: errorMessage });
        console.error(`[migratePhoneNumberClientIds] Error migrating document ${phoneDoc.id}:`, error);
      }
    }

    console.log(`[migratePhoneNumberClientIds] Migration complete:`, results);
    return results;
  } catch (error) {
    console.error("[migratePhoneNumberClientIds] Error during migration", error);
    throw error;
  }
}
