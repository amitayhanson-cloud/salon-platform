"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Helper to clean API key (remove any trailing ":1" or other suffixes)
function cleanApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) return undefined;
  // Remove trailing ":1" or similar suffixes that might be accidentally added
  return apiKey.trim().split(':')[0];
}

// Read environment variables
const firebaseConfig = {
  apiKey: cleanApiKey(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function missingKeys(cfg: Record<string, string | undefined>): string[] {
  return Object.entries(cfg)
    .filter(([_, v]) => !v || String(v).trim() === "")
    .map(([k]) => k);
}

// Validate API key format (should start with "AIza" for Firebase Web API key)
function validateApiKey(apiKey: string | undefined): boolean {
  if (!apiKey) return false;
  const trimmed = apiKey.trim();
  // Firebase Web API keys start with "AIza"
  return trimmed.startsWith("AIza") && trimmed.length > 20;
}

// Check if Firebase config is valid
export function isFirebaseConfigValid(): boolean {
  if (typeof window === "undefined") return false;
  
  const missing = missingKeys(firebaseConfig as any);
  if (missing.length > 0) {
    return false;
  }
  
  if (!validateApiKey(firebaseConfig.apiKey)) {
    return false;
  }
  
  return true;
}

// Get config status for debugging (doesn't expose sensitive data)
export function getFirebaseConfigStatus() {
  const missing = missingKeys(firebaseConfig as any);
  const apiKeyValid = validateApiKey(firebaseConfig.apiKey);
  
  return {
    isValid: missing.length === 0 && apiKeyValid,
    missingKeys: missing,
    apiKeyValid,
    projectId: firebaseConfig.projectId || "not set",
    authDomain: firebaseConfig.authDomain || "not set",
    apiKeyPrefix: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 6)}...` : "not set",
  };
}

// Initialize Firebase on both client and server
let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let initializationError: string | null = null;
let initialized = false;

// Initialize Firebase (works on both client and server)
function initializeFirebase() {
  if (initialized) return; // Already initialized
  
  const missing = missingKeys(firebaseConfig as any);
  const apiKeyValid = validateApiKey(firebaseConfig.apiKey);

  // Log helpful error messages in development, but don't crash
  if (missing.length > 0) {
    const errorMsg = `Firebase configuration incomplete. Missing env vars: ${missing.join(", ")}. Check your .env.local file.`;
    if (typeof window !== "undefined") {
      console.error("❌", errorMsg);
      console.error("💡 Tip: After updating .env.local, restart your dev server (npm run dev)");
    }
    initializationError = errorMsg;
    initialized = true;
    return;
  }

  if (!apiKeyValid) {
    // Only log first 6 chars for debugging (not full key)
    const currentKey = firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 6)}...` : "undefined";
    const errorMsg = `Firebase API key format invalid. Expected: AIza... (Firebase Web API key). Current: ${currentKey}`;
    if (typeof window !== "undefined") {
      console.error("❌", errorMsg);
      console.error("💡 Fix: Go to Firebase Console → Project Settings → General → Your apps (Web) → copy Web API key (starts with AIza...)");
      console.error("💡 Then update NEXT_PUBLIC_FIREBASE_API_KEY in .env.local and restart dev server");
    }
    initializationError = errorMsg;
    initialized = true;
    return;
  }

  // Config looks valid, try to initialize
  try {
    // Debug log (safe - doesn't expose full API key, only first 6 chars)
    const isClient = typeof window !== "undefined";
    if (isClient) {
      console.log("🔧 Firebase config loaded:", {
        projectId: firebaseConfig.projectId,
        authDomain: firebaseConfig.authDomain,
        apiKeyPrefix: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 6)}...` : "not set",
      });
    }

    // Initialize Firebase (only if not already initialized)
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig as any);
    } else {
      app = getApp();
    }
    
    // Auth only works on client side
    if (isClient) {
      _auth = getAuth(app);
    }
    
    // Firestore works on both client and server
    _db = getFirestore(app);
    
    // Storage only works on client side
    if (isClient) {
      _storage = getStorage(app);
    }
    
    // Debug logging
    if (isClient) {
      console.log("✅ Firebase initialized successfully");
      console.log("🔍 Firestore db:", typeof _db, _db ? `initialized (app: ${_db.app.name})` : "null");
    } else {
      console.log("✅ Firebase initialized on server");
      console.log("🔍 Firestore db:", typeof _db, _db ? `initialized (app: ${_db.app.name})` : "null");
    }
    
    initialized = true;
  } catch (error: any) {
    const errorMsg = `Firebase initialization failed: ${error.message || String(error)}`;
    console.error("❌", errorMsg);
    console.error("Full error:", error);
    initializationError = errorMsg;
    initialized = true;
  }
}

// Export error status (lazy)
export function getFirebaseError(): string | null {
  initializeFirebase();
  return initializationError;
}

// Lazy getters - Firebase only initializes when these are accessed
// This prevents initialization during Next.js build time
function getAuthLazy(): Auth | null {
  if (typeof window === "undefined") return null; // Auth only works on client
  initializeFirebase();
  return _auth;
}

function getDbLazy(): Firestore | null {
  initializeFirebase();
  return _db;
}

function getStorageLazy(): FirebaseStorage | null {
  if (typeof window === "undefined") return null; // Storage only works on client
  initializeFirebase();
  return _storage;
}

// Export lazy getters - Firebase only initializes when these are accessed
// IMPORTANT: Do NOT call initializeFirebase() at module level (removed)
// This prevents Firebase from initializing during Next.js build time
// 
// Note: These are still evaluated at import time, but they check for initialization
// The real fix is marking routes as dynamic (see page.tsx files with export const dynamic = "force-dynamic")

// Create a non-null object to use as Proxy target (Proxy requires object, not null)
const createAuthProxy = (): Auth | null => {
  let cached: Auth | null = null;
  // Use a dummy object as the target - Proxy requires a non-null object
  const dummyTarget = {} as Auth;
  return new Proxy(dummyTarget, {
    get(_target, prop) {
      if (!cached) {
        cached = getAuthLazy();
      }
      if (cached && prop in cached) {
        return (cached as any)[prop];
      }
      return undefined;
    }
  }) as Auth | null;
};

const createDbProxy = (): Firestore | null => {
  let cached: Firestore | null = null;
  // Use a dummy object as the target - Proxy requires a non-null object
  const dummyTarget = {} as Firestore;
  return new Proxy(dummyTarget, {
    get(_target, prop) {
      if (!cached) {
        cached = getDbLazy();
      }
      if (cached && prop in cached) {
        return (cached as any)[prop];
      }
      return undefined;
    }
  }) as Firestore | null;
};

const createStorageProxy = (): FirebaseStorage | null => {
  let cached: FirebaseStorage | null = null;
  // Use a dummy object as the target - Proxy requires a non-null object
  const dummyTarget = {} as FirebaseStorage;
  return new Proxy(dummyTarget, {
    get(_target, prop) {
      if (!cached) {
        cached = getStorageLazy();
      }
      if (cached && prop in cached) {
        return (cached as any)[prop];
      }
      return undefined;
    }
  }) as FirebaseStorage | null;
};

export const auth = createAuthProxy();
export const db = createDbProxy();
export const storage = createStorageProxy();
