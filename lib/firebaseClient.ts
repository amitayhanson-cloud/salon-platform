"use client";

/**
 * Firebase client config: ONLY from env vars (no hardcoded fallbacks).
 * Required: NEXT_PUBLIC_FIREBASE_PROJECT_ID, AUTH_DOMAIN, STORAGE_BUCKET, API_KEY, APP_ID, MESSAGING_SENDER_ID.
 * After changing .env.local, restart the dev server (npm run dev).
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth as firebaseGetAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage as firebaseGetStorage, type FirebaseStorage } from "firebase/storage";

function cleanApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) return undefined;
  return apiKey.trim().split(":")[0];
}

/** Build config ONLY from env vars; no fallbacks. */
function getFirebaseConfigFromEnv() {
  return {
    apiKey: cleanApiKey(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
  };
}

const CONFIG_KEY_TO_ENV: Record<string, string> = {
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
  messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
};

function getMissingClientEnvKeys(cfg: ReturnType<typeof getFirebaseConfigFromEnv>): string[] {
  const c = cfg as Record<string, string | undefined>;
  return Object.entries(CONFIG_KEY_TO_ENV)
    .filter(([configKey]) => !c[configKey] || String(c[configKey]).trim() === "")
    .map(([, envKey]) => envKey);
}

function validateApiKey(apiKey: string | undefined): boolean {
  if (!apiKey) return false;
  const trimmed = apiKey.trim();
  return trimmed.startsWith("AIza") && trimmed.length > 20;
}

export function isFirebaseConfigValid(): boolean {
  if (typeof window === "undefined") return false;
  const cfg = getFirebaseConfigFromEnv();
  const missing = getMissingClientEnvKeys(cfg);
  if (missing.length > 0) return false;
  if (!validateApiKey(cfg.apiKey)) return false;
  return true;
}

export function getFirebaseConfigStatus() {
  const cfg = getFirebaseConfigFromEnv();
  const missing = getMissingClientEnvKeys(cfg);
  const apiKeyValid = validateApiKey(cfg.apiKey);
  return {
    isValid: missing.length === 0 && apiKeyValid,
    missingKeys: missing,
    apiKeyValid,
    projectId: cfg.projectId ?? "not set",
    authDomain: cfg.authDomain ?? "not set",
    apiKeyPrefix: cfg.apiKey ? `${cfg.apiKey.substring(0, 6)}...` : "not set",
  };
}

// Initialize Firebase on both client and server
let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let initializationError: string | null = null;
let initialized = false;

// Initialize Firebase from env only; no hardcoded fallbacks.
function initializeFirebase() {
  if (initialized) return;

  const cfg = getFirebaseConfigFromEnv();
  const missing = getMissingClientEnvKeys(cfg);
  const apiKeyValid = validateApiKey(cfg.apiKey);
  const isDev = process.env.NODE_ENV === "development";

  if (missing.length > 0) {
    const errorMsg = `Firebase client: missing required env vars in .env.local: ${missing.join(", ")}. Add NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_APP_ID, NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, then restart the dev server (npm run dev).`;
    console.error("❌", errorMsg);
    initializationError = errorMsg;
    initialized = true;
    if (isDev) {
      console.warn("⚠️ Firebase will not work until .env.local is configured. Copy .env.example to .env.local and fill in your Caleno project values.");
      throw new Error(errorMsg);
    }
    return;
  }

  if (!apiKeyValid) {
    const errorMsg =
      "Firebase client: NEXT_PUBLIC_FIREBASE_API_KEY must be a Firebase Web API key (starts with AIza..., ~40 chars). Check .env.local and restart the dev server.";
    console.error("❌", errorMsg);
    initializationError = errorMsg;
    initialized = true;
    if (isDev) {
      throw new Error(errorMsg);
    }
    return;
  }

  try {
    const isClient = typeof window !== "undefined";
    if (isClient && isDev) {
      console.log("🔧 Firebase config (client):", {
        projectId: cfg.projectId,
        authDomain: cfg.authDomain,
        storageBucket: cfg.storageBucket ? `${cfg.storageBucket.slice(0, 24)}...` : "—",
        apiKeyPrefix: cfg.apiKey ? `${cfg.apiKey.substring(0, 6)}...` : "—",
      });
      if (
        (cfg.projectId?.includes("salon-platform") ?? false) ||
        (cfg.authDomain?.includes("salon-platform") ?? false)
      ) {
        console.warn(
          "⚠️ Firebase client is using the old salon-platform project. Set NEXT_PUBLIC_FIREBASE_* in .env.local to your Caleno project and restart the dev server (npm run dev)."
        );
      }
    }

    if (getApps().length === 0) {
      app = initializeApp(cfg as any);
    } else {
      app = getApp();
    }

    if (isClient) {
      _auth = firebaseGetAuth(app);
    }
    _db = getFirestore(app);

    if (isClient && cfg.storageBucket) {
      _storage = firebaseGetStorage(app, `gs://${cfg.storageBucket}`);
      if (isDev) console.log("🔍 Storage bucket (client):", cfg.storageBucket);
    }

    if (isDev) {
      console.log("✅ Firebase client initialized, projectId:", cfg.projectId);
    }
    initialized = true;
  } catch (error: any) {
    const errorMsg = `Firebase initialization failed: ${error.message || String(error)}`;
    console.error("❌", errorMsg);
    initializationError = errorMsg;
    initialized = true;
    if (isDev) throw new Error(errorMsg);
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
    const missing = getMissingClientEnvKeys(getFirebaseConfigFromEnv());
    const errorMsg = missing.length
      ? `Firestore not initialized. Missing env vars: ${missing.join(", ")}. Set in .env.local and restart dev server.`
      : `Firestore not initialized. ${initializationError ?? "Check Firebase configuration."}`;
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
