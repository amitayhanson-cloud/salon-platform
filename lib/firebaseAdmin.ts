// lib/firebaseAdmin.ts
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";
const isVercel = !!process.env.VERCEL;

/**
 * Parse service account JSON from FIREBASE_SERVICE_ACCOUNT_JSON env var
 * Handles both single and double-encoded JSON strings
 */
function parseServiceAccountFromEnv(): any | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    // First parse attempt
    let parsed = JSON.parse(trimmed);

    // Handle double-encoded JSON (common when pasting into env vars)
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }

    // Ensure it has required fields
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    // Fix private_key newlines (common issue with env vars)
    if (parsed.private_key && typeof parsed.private_key === "string") {
      // Replace escaped newlines with actual newlines
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      // Remove any surrounding quotes that might have been added
      parsed.private_key = parsed.private_key.replace(/^["']|["']$/g, "");
    }

    return parsed;
  } catch (error) {
    // Don't log the actual error (might contain secrets)
    console.warn("[firebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON");
    return null;
  }
}

/**
 * Build service account from separate env vars (fallback method)
 */
function buildServiceAccountFromSplitEnv(): any | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  // Fix private key newlines and quotes
  const privateKey = privateKeyRaw
    .replace(/\\n/g, "\n")  // Replace escaped newlines
    .replace(/\r\n/g, "\n") // Replace Windows line endings
    .replace(/^["']|["']$/g, "") // Remove surrounding quotes
    .trim();

  return {
    type: "service_account",
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

/**
 * Load service account from path in FIREBASE_SERVICE_ACCOUNT_PATH (DEVELOPMENT ONLY).
 * No hardcoded paths — must point to your project (e.g. Caleno), not old salon-platform.
 */
function loadServiceAccountFromFile(): any | null {
  if (isProduction || isVercel) return null;
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!pathEnv) return null;
  const filePath = path.isAbsolute(pathEnv) ? pathEnv : path.join(process.cwd(), pathEnv);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const obj = JSON.parse(raw);
    if (obj?.private_key && typeof obj.private_key === "string") {
      obj.private_key = obj.private_key.replace(/\\n/g, "\n");
    }
    console.log("[firebaseAdmin] Loaded credentials from FIREBASE_SERVICE_ACCOUNT_PATH (development only), project_id:", obj?.project_id ?? "unknown");
    return obj;
  } catch {
    console.warn("[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_PATH file failed to read/parse");
    return null;
  }
}

/**
 * Get service account credentials
 * Priority:
 * 1. FIREBASE_SERVICE_ACCOUNT_JSON (preferred for production)
 * 2. Split env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
 * 3. Local JSON file (development only, never in production/Vercel)
 */
function getServiceAccount(): any {
  // Try env var first (required for production/Vercel)
  const fromEnv = parseServiceAccountFromEnv();
  if (fromEnv) {
    return fromEnv;
  }

  // Try split env vars
  const fromSplit = buildServiceAccountFromSplitEnv();
  if (fromSplit) {
    return fromSplit;
  }

  // Try local file (development only)
  const fromFile = loadServiceAccountFromFile();
  if (fromFile) {
    return fromFile;
  }

  return null;
}

// Lazy initialization - only initialize when getAdmin() is first called
let _admin: typeof admin | null = null;
let _adminProjectId: string | null = null;
let _initializationError: Error | null = null;

/** Return the Firebase project ID the Admin SDK is connected to (for diagnostics). */
export function getAdminProjectId(): string | null {
  try {
    getAdmin();
    if (_adminProjectId) return _adminProjectId;
    return process.env.FIREBASE_PROJECT_ID?.trim() ?? null;
  } catch {
    return null;
  }
}

export function getAdmin(): typeof admin {
  // Return cached instance if already initialized
  if (_admin) {
    return _admin;
  }

  // If we already tried and failed, throw the cached error
  if (_initializationError) {
    throw _initializationError;
  }

  // Check if already initialized by another call
  if (admin.apps.length > 0) {
    _admin = admin;
    const app = admin.app();
    _adminProjectId = (app.options as { credential?: { projectId?: string } })?.credential?.projectId ?? null;
    return _admin;
  }

  // Get service account credentials
  const serviceAccount = getServiceAccount();

  if (!serviceAccount) {
    const error = new Error(
      isProduction || isVercel
        ? "Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable. Required for production builds."
        : "No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON or split env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY), or FIREBASE_SERVICE_ACCOUNT_PATH to a Caleno/your-project JSON file (development only)."
    );
    _initializationError = error;
    throw error;
  }

  // Validate required fields
  if (!serviceAccount.private_key || !serviceAccount.client_email || !serviceAccount.project_id) {
    const error = new Error(
      "Invalid Firebase service account. Missing required fields: private_key, client_email, or project_id"
    );
    _initializationError = error;
    throw error;
  }

  try {
    // Storage is optional (we use Cloudinary for uploads). Only set storageBucket when env is present.
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
    const initOptions: { credential: admin.credential.Credential; storageBucket?: string } = {
      credential: admin.credential.cert(serviceAccount),
    };
    if (storageBucket) {
      initOptions.storageBucket = storageBucket;
      if (process.env.NODE_ENV === "development") {
        console.log("[firebaseAdmin] Storage bucket (server):", storageBucket);
      }
    }
    admin.initializeApp(initOptions);
    _adminProjectId = serviceAccount.project_id ?? null;
    if (process.env.NODE_ENV === "development") {
      console.log("[firebaseAdmin] projectId (server):", _adminProjectId ?? "unknown");
    }
    _admin = admin;
    return _admin;
  } catch (error: any) {
    // Cache the error to avoid repeated initialization attempts
    const initError = new Error(
      `Failed to initialize Firebase Admin: ${error.message || "Unknown error"}. Check your FIREBASE_SERVICE_ACCOUNT_JSON format.`
    );
    _initializationError = initError;
    throw initError;
  }
}

export function getAdminDb() {
  return getAdmin().firestore();
}

// Export admin auth instance (lazy initialization)
export function getAdminAuth() {
  return getAdmin().auth();
}

/**
 * Returns Firebase Admin Storage bucket. Only use if FIREBASE_STORAGE_BUCKET is set.
 * Logo uploads use Cloudinary; this is for any remaining Firebase Storage usage.
 */
export function getAdminStorageBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (!bucketName) {
    throw new Error(
      "FIREBASE_STORAGE_BUCKET is not set. Set it in .env.local to use Firebase Admin Storage, or use Cloudinary for uploads."
    );
  }
  const { getStorage } = require("firebase-admin/storage");
  return getStorage().bucket(bucketName);
}

// Export as `auth` for convenience (matches the import in route files)
// IMPORTANT: This is a getter object that lazily initializes when first accessed
// This ensures Firebase Admin only initializes when actually used, not at import time
let _authInstance: ReturnType<typeof getAdminAuth> | null = null;
const authProxy = new Proxy({} as ReturnType<typeof getAdminAuth>, {
  get(_target, prop) {
    if (!_authInstance) {
      _authInstance = getAdminAuth();
    }
    const value = (_authInstance as any)[prop];
    if (typeof value === "function") {
      return value.bind(_authInstance);
    }
    return value;
  }
});
export const auth = authProxy;

// For backward compatibility, export default admin (but don't initialize at import time)
export default admin;
