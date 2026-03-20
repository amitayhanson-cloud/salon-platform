import { getDb } from "./firebaseClient";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import type { User, Website, SetupStatus } from "@/types/user";
import type { MainGoal } from "@/types/siteConfig";

const MAIN_GOAL_VALUES = new Set<string>([
  "new_clients",
  "online_booking",
  "show_photos",
  "info_only",
]);

function parseOnboardingMainGoals(raw: unknown): MainGoal[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter(
    (g): g is MainGoal => typeof g === "string" && MAIN_GOAL_VALUES.has(g)
  );
  return out.length > 0 ? out : undefined;
}

const USERS_COLLECTION = "users";
const WEBSITES_COLLECTION = "websites";

// Helper to convert Firestore timestamp to Date
function timestampToDate(timestamp: any): Date {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  return new Date();
}

/** Normalize phone for Firestore: trim; empty → null (field still stored so admins can see it was cleared). */
export function normalizeUserPhoneForStorage(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  const t = String(phone).trim();
  return t === "" ? null : t;
}

// Create a new user document
export async function createUserDocument(
  userId: string,
  email: string,
  name?: string,
  phone?: string | null
): Promise<User> {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  const userRef = doc(db, USERS_COLLECTION, userId);
  const normalizedPhone = normalizeUserPhoneForStorage(phone);
  const trimmedName =
    name != null && String(name).trim() !== "" ? String(name).trim() : undefined;

  const userData: User = {
    id: userId,
    email: email || "",
    name: trimmedName,
    phone: normalizedPhone,
    siteId: null, // No siteId at signup - will be set after wizard completion
    createdAt: new Date(),
  };

  const payload: Record<string, unknown> = {
    id: userId,
    email: userData.email,
    siteId: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    // Always write phone so platform admins / support see the field in Console & API
    phone: normalizedPhone,
  };
  if (trimmedName !== undefined) payload.name = trimmedName;

  await setDoc(userRef, payload);

  return userData;
}

// Get user document
export async function getUserDocument(userId: string): Promise<User | null> {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  const userRef = doc(db, USERS_COLLECTION, userId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    return null;
  }

  const data = userSnap.data();
  return {
    id: userSnap.id,
    email: data.email ?? "",
    name: data.name,
    phone: typeof data.phone === "string" && data.phone ? data.phone : null,
    siteId: data.siteId || null,
    primarySlug: typeof data.primarySlug === "string" && data.primarySlug ? data.primarySlug : null,
    onboardingMainGoals: parseOnboardingMainGoals(data.onboardingMainGoals),
    onboardingSiteDisplayPhone:
      typeof data.onboardingSiteDisplayPhone === "string"
        ? data.onboardingSiteDisplayPhone.trim() || null
        : data.onboardingSiteDisplayPhone === null
          ? null
          : undefined,
    createdAt: timestampToDate(data.createdAt),
    updatedAt: data.updatedAt ? timestampToDate(data.updatedAt) : undefined,
  };
}

/** Update user profile fields (name, email, phone, onboarding wizard data). Merge only provided fields. */
export async function updateUserProfile(
  userId: string,
  updates: {
    name?: string;
    email?: string;
    phone?: string | null;
    onboardingMainGoals?: MainGoal[];
    onboardingSiteDisplayPhone?: string | null;
  }
): Promise<void> {
  const db = getDb();
  const userRef = doc(db, USERS_COLLECTION, userId);
  const payload: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.phone !== undefined) {
    payload.phone = normalizeUserPhoneForStorage(updates.phone);
  }
  if (updates.onboardingMainGoals !== undefined) {
    payload.onboardingMainGoals = updates.onboardingMainGoals;
  }
  if (updates.onboardingSiteDisplayPhone !== undefined) {
    payload.onboardingSiteDisplayPhone = updates.onboardingSiteDisplayPhone;
  }
  await setDoc(userRef, payload, { merge: true });
}

// Update user's siteId
export async function updateUserSiteId(
  userId: string,
  siteId: string
): Promise<void> {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  const userRef = doc(db, USERS_COLLECTION, userId);
  await setDoc(
    userRef,
    {
      siteId,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  
  console.log(`[updateUserSiteId] Updated users/${userId}.siteId = ${siteId}`);
}

// Alias for backward compatibility (used by create-website route)
export const updateUserWebsiteId = updateUserSiteId;

// Create a new website document
export async function createWebsiteDocument(
  ownerUserId: string,
  subdomain: string,
  templateId: string = "luxury"
): Promise<Website> {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  // Check if subdomain is already taken
  const websitesRef = collection(db, WEBSITES_COLLECTION);
  const q = query(websitesRef, where("subdomain", "==", subdomain));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    throw new Error("Subdomain already taken");
  }

  // Create new website document
  const newWebsiteRef = doc(collection(db, WEBSITES_COLLECTION));
  const websiteData: Website = {
    id: newWebsiteRef.id,
    ownerUserId,
    templateId,
    subdomain,
    setupStatus: "not_started", // New users start with onboarding
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
  };

  await setDoc(newWebsiteRef, {
    ...websiteData,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  return websiteData;
}

// Get website by owner user ID
export async function getWebsiteByOwnerId(
  ownerUserId: string
): Promise<Website | null> {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  const websitesRef = collection(db, WEBSITES_COLLECTION);
  const q = query(websitesRef, where("ownerUserId", "==", ownerUserId));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    return null;
  }

  const doc = querySnapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    ownerUserId: data.ownerUserId,
    templateId: data.templateId,
    subdomain: data.subdomain,
    customDomain: data.customDomain,
    setupStatus: data.setupStatus || "not_started", // Default for backward compatibility
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
    isActive: data.isActive,
  };
}

// Get website by ID
export async function getWebsiteById(
  websiteId: string
): Promise<Website | null> {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  const websiteRef = doc(db, WEBSITES_COLLECTION, websiteId);
  const websiteSnap = await getDoc(websiteRef);

  if (!websiteSnap.exists()) {
    return null;
  }

  const data = websiteSnap.data();
  return {
    id: websiteSnap.id,
    ownerUserId: data.ownerUserId,
    templateId: data.templateId,
    subdomain: data.subdomain,
    customDomain: data.customDomain,
    setupStatus: data.setupStatus || "not_started", // Default for backward compatibility
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
    isActive: data.isActive,
  };
}
