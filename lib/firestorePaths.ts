import { collection, doc, type Firestore } from "firebase/firestore";
import { db } from "./firebaseClient";

/**
 * Standardized Firestore path helpers for multi-tenant salon platform
 * All paths follow: sites/{siteId}/...
 * Note: siteId is the site document ID, not userId
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

export function tasksCollection(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return collection(db, "sites", siteId, "tasks");
}

export function taskDoc(siteId: string, taskId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "tasks", taskId);
}

export function bookingSettingsDoc(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "settings", "booking");
}

/** sites/{siteId}/settings/cleanup — expired bookings auto-delete setting */
export function cleanupSettingsDoc(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "settings", "cleanup");
}

export function clientsCollection(siteId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return collection(db, "sites", siteId, "clients");
}

export function clientDoc(siteId: string, clientId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "sites", siteId, "clients", clientId);
}

// DEPRECATED: Personal pricing is now stored as a field on the client document
// sites/{siteId}/clients/{clientId}.personalPricing[serviceTypeId]
// These functions are kept for backward compatibility but should not be used
export function personalPricingCollection(siteId: string, clientId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  console.warn("[DEPRECATED] personalPricingCollection - use client doc field instead");
  return collection(db, "sites", siteId, "clients", clientId, "personalPricing");
}

export function personalPricingDoc(siteId: string, clientId: string, serviceTypeId: string) {
  if (!db) throw new Error("Firestore db not initialized");
  console.warn("[DEPRECATED] personalPricingDoc - use client doc field instead");
  return doc(db, "sites", siteId, "clients", clientId, "personalPricing", serviceTypeId);
}

/** platform/landing — main platform landing page content (CMS) */
export function platformLandingDoc() {
  if (!db) throw new Error("Firestore db not initialized");
  return doc(db, "platform", "landing");
}
