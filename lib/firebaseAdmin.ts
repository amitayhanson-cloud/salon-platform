/**
 * lib/firebaseAdmin.ts
 * Single Firebase Admin SDK entry point for the app.
 * - Initializes only when admin.apps.length === 0; reuses existing app otherwise (safe for Next.js hot reload).
 * - Supports FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_SERVICE_ACCOUNT_PATH.
 * - Export: adminApp, adminDb, getAdmin(), getAdminDb(), getAdminAuth(), getAdminProjectId().
 */
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
 * Build service account from separate env vars (fallback method).
 * FIREBASE_PROJECT_ID should match NEXT_PUBLIC_FIREBASE_PROJECT_ID (same project as client).
 */
function buildServiceAccountFromSplitEnv(): any | null {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
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
 * Load service account from path in FIREBASE_SERVICE_ACCOUNT_PATH.
 * Path is resolved relative to process.cwd() (project root).
 * In production/Vercel we skip file and use JSON env instead.
 */
function loadServiceAccountFromFile(): any | null {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!pathEnv) return null;
  const filePath = path.isAbsolute(pathEnv) ? pathEnv : path.resolve(process.cwd(), pathEnv);
  if (!fs.existsSync(filePath)) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_PATH file not found:", filePath);
    }
    return null;
  }
  if (isProduction || isVercel) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const obj = JSON.parse(raw);
    if (obj?.private_key && typeof obj.private_key === "string") {
      obj.private_key = obj.private_key.replace(/\\n/g, "\n");
    }
    return obj;
  } catch {
    console.warn("[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_PATH file failed to read/parse:", filePath);
    return null;
  }
}

export type AdminCredentialType = "cert/path" | "cert/json" | "cert/split" | "applicationDefault";

/**
 * Get service account credentials and which source was used.
 * Priority (forced when env is set):
 * 1. FIREBASE_SERVICE_ACCOUNT_PATH — read file from project root (dev only; prod uses JSON)
 * 2. FIREBASE_SERVICE_ACCOUNT_JSON — parsed JSON string
 * 3. Split env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
 * 4. applicationDefault (with warning)
 */
function getServiceAccountAndType(): { account: any; credentialType: AdminCredentialType } {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()) {
    const fromFile = loadServiceAccountFromFile();
    if (fromFile) {
      return { account: fromFile, credentialType: "cert/path" };
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    const fromEnv = parseServiceAccountFromEnv();
    if (fromEnv) {
      return { account: fromEnv, credentialType: "cert/json" };
    }
  }

  const fromSplit = buildServiceAccountFromSplitEnv();
  if (fromSplit) {
    return { account: fromSplit, credentialType: "cert/split" };
  }

  return { account: null, credentialType: "applicationDefault" };
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

  // Reuse existing app if already initialized (required for Next.js hot reload and multiple route handlers)
  if (admin.apps.length > 0) {
    _admin = admin;
    const app = admin.app();
    _adminProjectId = (app.options as { credential?: { projectId?: string } })?.credential?.projectId ?? null;
    return _admin;
  }

  const { account: serviceAccount, credentialType } = getServiceAccountAndType();

  if (credentialType === "applicationDefault") {
    if (isProduction || isVercel) {
      const error = new Error(
        "Missing Firebase credentials in production. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH."
      );
      _initializationError = error;
      throw error;
    }
    console.warn(
      "\n⚠️ [firebaseAdmin] BIG WARNING: Using Application Default Credentials (ADC). No FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON set. Set one of them in .env.local to use the correct project.\n"
    );
    console.log("🔥 ADMIN CREDENTIAL TYPE: applicationDefault");
    try {
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
      const initOptions: { credential: admin.credential.Credential; storageBucket?: string } = {
        credential: admin.credential.applicationDefault(),
      };
      if (storageBucket) initOptions.storageBucket = storageBucket;
      admin.initializeApp(initOptions);
      _admin = admin;
      _adminProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? null;
      return _admin;
    } catch (error: any) {
      _initializationError = error;
      throw error;
    }
  }

  if (!serviceAccount?.private_key || !serviceAccount?.client_email || !serviceAccount?.project_id) {
    const error = new Error(
      "Invalid Firebase service account. Missing required fields: private_key, client_email, or project_id"
    );
    _initializationError = error;
    throw error;
  }

  const adminProjectId = String(serviceAccount.project_id).trim();
  const isDev = process.env.NODE_ENV === "development";

  console.log("🔥 ADMIN CREDENTIAL TYPE:", credentialType);
  console.log("🔥 ADMIN CREDENTIAL EMAIL:", serviceAccount.client_email);

  if (isDev) {
    const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
    console.log("🔥 ADMIN FIREBASE PROJECT:", adminProjectId);
    if (clientProjectId) {
      console.log("🔥 CLIENT FIREBASE PROJECT (expected):", clientProjectId);
      if (adminProjectId !== clientProjectId) {
        const error = new Error(
          "Firebase project mismatch between client and admin. " +
            "Ensure your service account (FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH) belongs to the same project as NEXT_PUBLIC_FIREBASE_PROJECT_ID."
        );
        _initializationError = error;
        throw error;
      }
    }
  }

  try {
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
    const initOptions: { credential: admin.credential.Credential; storageBucket?: string } = {
      credential: admin.credential.cert(serviceAccount),
    };
    if (storageBucket) initOptions.storageBucket = storageBucket;
    admin.initializeApp(initOptions);
    _adminProjectId = adminProjectId;
    _admin = admin;
    return _admin;
  } catch (error: any) {
    _initializationError = new Error(
      `Failed to initialize Firebase Admin: ${error.message || "Unknown error"}. Check your service account file or JSON.`
    );
    throw _initializationError;
  }
}

export function getAdminDb() {
  return getAdmin().firestore();
}

/** Single Firestore instance; use this or getAdminDb() so Admin is initialized once and reused everywhere. */
export const adminDb = new Proxy({} as ReturnType<typeof getAdminDb>, {
  get(_, prop) {
    const db = getAdminDb();
    const v = (db as any)[prop];
    return typeof v === "function" ? v.bind(db) : v;
  },
});

/** Single Admin app instance; use getAdmin() or this so Admin is initialized once and reused everywhere. */
export const adminApp = new Proxy({} as ReturnType<typeof admin.app>, {
  get(_, prop) {
    const app = getAdmin();
    const v = (app as any)[prop];
    return typeof v === "function" ? v.bind(app) : v;
  },
});

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
