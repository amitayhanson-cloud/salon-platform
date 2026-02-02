import { doc, type Firestore } from "firebase/firestore";
import { db } from "./firebaseClient";

/**
 * Canonical client document reference helper
 * 
 * Core Rule: Client document ID = phone number
 * Path: sites/{siteId}/clients/{phone}
 * 
 * This helper MUST be used everywhere instead of manually constructing doc paths.
 */
export function clientDocRef(siteId: string, phone: string) {
  if (!db) throw new Error("Firestore db not initialized");
  
  // Normalize phone (remove spaces, dashes, etc.)
  const normalizedPhone = phone.replace(/\s|-|\(|\)/g, "");
  
  return doc(db, "sites", siteId, "clients", normalizedPhone);
}
