"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth as firebaseGetAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage as firebaseGetStorage, type FirebaseStorage } from "firebase/storage";

// Helper to clean API key (remove any trailing ":1" or other suffixes)
function cleanApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) return undefined;
  // Remove trailing ":1" or similar suffixes that might be accidentally added
  return apiKey.trim().split(':')[0];
}

// Single source of truth: exact bucket name from Firebase Console → Storage (e.g. xxxx.appspot.com)
const CLIENT_STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || undefined;

const firebaseConfig = {
  apiKey: cleanApiKey(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: CLIENT_STORAGE_BUCKET,
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
      _auth = firebaseGetAuth(app);
    }
    
    // Firestore works on both client and server
    _db = getFirestore(app);

    // Storage only works on client side; require bucket and use explicit gs:// URL
    if (isClient) {
      if (!CLIENT_STORAGE_BUCKET) {
        const err = "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is required for Storage. Set it in .env.local to the exact bucket name from Firebase Console → Storage (e.g. your-project.appspot.com).";
        console.error("❌", err);
        throw new Error(err);
      }
      _storage = firebaseGetStorage(app, `gs://${CLIENT_STORAGE_BUCKET}`);
      if (process.env.NODE_ENV === "development") {
        console.log("🔍 Storage bucket (client):", CLIENT_STORAGE_BUCKET);
      }
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

/**
 * Get Firebase App instance
 * Lazy initialization - only initializes when first called
 */
export function getFirebaseApp(): FirebaseApp {
  initializeFirebase();
  if (!app) {
    throw new Error("Firebase App not initialized. Check your Firebase configuration.");
  }
  return app;
}

/**
 * Get Firebase Auth instance (client-side only)
 * Lazy initialization - only initializes when first called
 */
export function getClientAuth(): Auth {
  if (typeof window === "undefined") {
    throw new Error("Firebase Auth is only available on the client side");
  }
  initializeFirebase();
  if (!_auth) {
    throw new Error("Firebase Auth not initialized. Check your Firebase configuration.");
  }
  return _auth;
}

/**
 * Get Firestore instance (works on both client and server)
 * Lazy initialization - only initializes when first called
 * This is the SAFE way to get db - always returns a real Firestore instance
 */
export function getDb(): Firestore {
  initializeFirebase();
  if (!_db) {
    // Log env var presence (not values) for debugging
    const envVars = {
      hasApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      hasAuthDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      hasStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      hasMessagingSenderId: !!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      hasAppId: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    
    const errorMsg = `Firestore db not initialized. Check Firebase configuration. Env vars present: ${JSON.stringify(envVars)}`;
    console.error("❌", errorMsg);
    if (initializationError) {
      console.error("❌ Initialization error:", initializationError);
    }
    throw new Error(errorMsg);
  }
  return _db;
}

/**
 * Get Firebase Storage instance (client-side only)
 * Lazy initialization - only initializes when first called
 */
export function getClientStorage(): FirebaseStorage {
  if (typeof window === "undefined") {
    throw new Error("Firebase Storage is only available on the client side");
  }
  initializeFirebase();
  if (!_storage) {
    throw new Error("Firebase Storage not initialized. Check your Firebase configuration.");
  }
  return _storage;
}

// Legacy exports for backward compatibility
// These use getters to ensure lazy initialization
// IMPORTANT: Prefer using getClientAuth(), getDb(), getClientStorage() directly for better error handling
export const auth = (() => {
  if (typeof window === "undefined") return null;
  try {
    return getClientAuth();
  } catch {
    return null;
  }
})() as Auth | null;

export const db = (() => {
  try {
    return getDb();
  } catch {
    return null;
  }
})() as Firestore | null;

export const storage = (() => {
  if (typeof window === "undefined") return null;
  try {
    return getClientStorage();
  } catch {
    return null;
  }
})() as FirebaseStorage | null;
