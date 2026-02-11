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
import type { User, UserRole, Website, SetupStatus } from "@/types/user";

const USERS_COLLECTION = "users";
const WEBSITES_COLLECTION = "websites";

// Helper to convert Firestore timestamp to Date
function timestampToDate(timestamp: any): Date {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  return new Date();
}

// Create a new user document
export async function createUserDocument(
  userId: string,
  email: string,
  name?: string
): Promise<User> {
  const db = getDb(); // Always get a fresh, valid Firestore instance
  const userRef = doc(db, USERS_COLLECTION, userId);
  const userData: User = {
    id: userId,
    email,
    name,
    siteId: null, // No siteId at signup - will be set after wizard completion
    createdAt: new Date(),
  };

  await setDoc(userRef, {
    ...userData,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

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
    email: data.email,
    name: data.name,
    siteId: data.siteId || null, // Default to null if missing
    createdAt: timestampToDate(data.createdAt),
    updatedAt: data.updatedAt ? timestampToDate(data.updatedAt) : undefined,
  };
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
