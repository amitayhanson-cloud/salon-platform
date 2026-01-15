import { collection, doc, type Firestore } from "firebase/firestore";
import { db } from "./firebaseClient";

/**
 * Standardized Firestore path helpers for multi-tenant salon platform
 * All paths follow: sites/{siteId}/...
 */

export function workersCollection(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return collection(db, "sites", siteId, "workers");
}

export function bookingsCollection(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return collection(db, "sites", siteId, "bookings");
}

export function workerDoc(siteId: string, workerId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "workers", workerId);
}

export function bookingDoc(siteId: string, bookingId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "bookings", bookingId);
}

export function bookingSettingsDoc(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "settings", "booking");
}

export function clientsCollection(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return collection(db, "sites", siteId, "clients");
}

export function clientDoc(siteId: string, clientId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "clients", clientId);
}

