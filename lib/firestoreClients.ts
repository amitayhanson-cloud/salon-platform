import {
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  collection,
} from "firebase/firestore";
import { db } from "./firebaseClient";
import { clientsCollection, bookingsCollection } from "./firestorePaths";
import { clientDocRef } from "./firestoreClientRefs";

export interface ClientData {
  name: string;
  phone: string; // Phone number IS the document ID
  email?: string;
  notes?: string;
  chemicalCard?: any;
  personalPricing?: Record<string, number>;
  createdAt?: string | Timestamp;
  updatedAt?: string | Timestamp;
  lastVisit?: string; // ISO date string
  totalBookings?: number; // Computed from bookings
}

/**
 * Check if a client with the given phone already exists
 * Since phone IS the document ID, we just check if the doc exists
 */
export async function checkClientExists(
  siteId: string,
  phone: string
): Promise<{ exists: boolean; clientId?: string; clientData?: ClientData }> {
  try {
    const docRef = clientDocRef(siteId, phone);
    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {
      const data = snapshot.data();
      return {
        exists: true,
        clientId: phone,
        clientData: {
          name: data.name || "",
          phone: data.phone || phone, // Use phone from data or fallback to param
          email: data.email || undefined,
          notes: data.notes || undefined,
          chemicalCard: data.chemicalCard,
          personalPricing: data.personalPricing,
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
 * - Phone number IS the document ID
 * - Uses setDoc with merge to create or update
 */
export async function getOrCreateClient(
  siteId: string,
  clientData: { name: string; phone: string; email?: string; notes?: string }
): Promise<string> {
  try {
    // Normalize phone (remove spaces, dashes, etc.)
    const normalizedPhone = clientData.phone.replace(/\s|-|\(|\)/g, "");

    const docRef = clientDocRef(siteId, normalizedPhone);
    
    // Check if client already exists
    const existing = await checkClientExists(siteId, normalizedPhone);
    if (existing.exists && existing.clientData) {
      // Client exists - update name/email if provided and different
      const needsUpdate = 
        (clientData.name.trim() && existing.clientData.name !== clientData.name.trim()) ||
        (clientData.email && existing.clientData.email !== clientData.email) ||
        (clientData.notes && existing.clientData.notes !== clientData.notes);

      if (needsUpdate) {
        await setDoc(
          docRef,
          {
            name: clientData.name.trim() || existing.clientData.name,
            phone: normalizedPhone,
            email: clientData.email?.trim() || null,
            notes: clientData.notes?.trim() || null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      
      console.log("[getOrCreateClient] Found existing client", {
        siteId,
        phone: normalizedPhone,
      });
      
      return normalizedPhone;
    }

    // Client doesn't exist - create new one with phone as ID
    await setDoc(
      docRef,
      {
        name: clientData.name.trim(),
        phone: normalizedPhone,
        email: clientData.email?.trim() || null,
        notes: clientData.notes?.trim() || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("[getOrCreateClient] Created new client", {
      siteId,
      phone: normalizedPhone,
    });

    return normalizedPhone;
  } catch (error) {
    console.error("[getOrCreateClient] Error getting/creating client", error);
    throw error;
  }
}

/**
 * Create a new client document
 * Phone number IS the document ID
 */
export async function createClient(
  siteId: string,
  client: Omit<ClientData, "createdAt" | "updatedAt">
): Promise<string> {
  try {
    // Normalize phone (remove spaces, dashes, etc.)
    const normalizedPhone = client.phone.replace(/\s|-|\(|\)/g, "");

    // Check if client already exists
    const existing = await checkClientExists(siteId, normalizedPhone);
    if (existing.exists) {
      throw new Error("CLIENT_EXISTS");
    }

    const docRef = clientDocRef(siteId, normalizedPhone);
    await setDoc(
      docRef,
      {
        name: client.name.trim(),
        phone: normalizedPhone,
        email: client.email?.trim() || null,
        notes: client.notes?.trim() || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("[createClient] Created client", {
      siteId,
      phone: normalizedPhone,
    });

    return normalizedPhone;
  } catch (error) {
    console.error("[createClient] Error creating client", error);
    throw error;
  }
}

/**
 * Update an existing client document
 * clientId is the phone number (document ID)
 */
export async function updateClient(
  siteId: string,
  phone: string,
  updates: Partial<Omit<ClientData, "createdAt">>
): Promise<void> {
  try {
    const docRef = clientDocRef(siteId, phone);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };

    if (updates.name !== undefined) {
      updateData.name = updates.name.trim();
    }
    if (updates.phone !== undefined) {
      // If phone is being updated, we need to create a new doc with new phone and delete old one
      const newPhone = updates.phone.replace(/\s|-|\(|\)/g, "");
      if (newPhone !== phone) {
        throw new Error("Cannot change client phone number. Create a new client instead.");
      }
      updateData.phone = newPhone;
    }
    if (updates.email !== undefined) {
      updateData.email = updates.email?.trim() || null;
    }
    if (updates.notes !== undefined) {
      updateData.notes = updates.notes?.trim() || null;
    }

    await setDoc(docRef, updateData, { merge: true });

    console.log("[updateClient] Updated client", {
      siteId,
      phone,
      updates: Object.keys(updateData),
    });
  } catch (error) {
    console.error("[updateClient] Error updating client", error);
    throw error;
  }
}

/**
 * Get a client by phone number (document ID)
 */
export async function getClient(
  siteId: string,
  phone: string
): Promise<ClientData | null> {
  try {
    const docRef = clientDocRef(siteId, phone);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return {
      name: data.name || "",
      phone: data.phone || phone, // Use phone from data or fallback to param
      email: data.email || undefined,
      notes: data.notes || undefined,
      chemicalCard: data.chemicalCard,
      personalPricing: data.personalPricing,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || undefined,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || undefined,
    };
  } catch (error) {
    console.error("[getClient] Error getting client", error);
    throw error;
  }
}

const BATCH_SIZE = 400;

/**
 * Delete all documents in a client subcollection (Firestore has no recursive delete).
 * Handles chemicalCard, personalPricing, or any other subcollection name safely.
 */
async function deleteSubcollectionDocs(
  siteId: string,
  phone: string,
  subcollectionName: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const ref = collection(db, "sites", siteId, "clients", phone, subcollectionName);
  let snapshot = await getDocs(ref);
  while (!snapshot.empty) {
    const batch = writeBatch(db);
    const chunk = snapshot.docs.slice(0, BATCH_SIZE);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snapshot.docs.length <= BATCH_SIZE) break;
    snapshot = await getDocs(ref);
  }
}

/**
 * Count bookings for a client (customerPhone or clientId = phone).
 */
export async function getClientBookingsCount(siteId: string, phone: string): Promise<number> {
  const q = query(
    bookingsCollection(siteId),
    where("customerPhone", "==", phone)
  );
  const snapshot = await getDocs(q);
  return snapshot.size;
}

/**
 * Delete client document and all subcollection docs.
 * Returns { hasBookings: true } if client has bookings (caller should offer archive instead).
 * Returns { deleted: true } on success.
 */
export async function deleteClient(
  siteId: string,
  phone: string
): Promise<{ deleted: true } | { hasBookings: true }> {
  if (!siteId || !phone) {
    throw new Error("Missing siteId or phone");
  }
  const count = await getClientBookingsCount(siteId, phone);
  if (count > 0) {
    return { hasBookings: true };
  }
  const subcollections = ["chemicalCard", "personalPricing"];
  for (const subName of subcollections) {
    try {
      await deleteSubcollectionDocs(siteId, phone, subName);
    } catch (e) {
      // Subcollection may not exist; ignore
    }
  }
  const docRef = clientDocRef(siteId, phone);
  await deleteDoc(docRef);
  return { deleted: true };
}

/**
 * Archive a client (set archived: true). Client can be hidden from main list.
 */
export async function archiveClient(siteId: string, phone: string): Promise<void> {
  const docRef = clientDocRef(siteId, phone);
  await setDoc(
    docRef,
    { archived: true, archivedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * Get all clients from the clients collection
 * Document ID = phone number
 */
export async function getAllClients(siteId: string): Promise<ClientData[]> {
  try {
    const clientsRef = clientsCollection(siteId);
    const snapshot = await getDocs(clientsRef);

    const clients: ClientData[] = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      clients.push({
        name: data.name || "",
        phone: data.phone || doc.id, // Use phone from data or fallback to doc.id (which is phone)
        email: data.email || undefined,
        notes: data.notes || undefined,
        chemicalCard: data.chemicalCard,
        personalPricing: data.personalPricing,
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
