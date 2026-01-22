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
 * Load service account from local JSON file (DEVELOPMENT ONLY)
 * NEVER loads in production or on Vercel
 */
function loadServiceAccountFromFile(): any | null {
  // NEVER load local files in production or on Vercel
  if (isProduction || isVercel) {
    return null;
  }

  // Only try in development
  const filename = "salon-platform-34cec-firebase-adminsdk-fbsvc-f73cb413cd.json";
  const filePath = path.join(process.cwd(), filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const obj = JSON.parse(raw);

    // Fix private_key newlines
    if (obj?.private_key && typeof obj.private_key === "string") {
      obj.private_key = obj.private_key.replace(/\\n/g, "\n");
    }

    console.log("[firebaseAdmin] Loaded credentials from local JSON file (development only)");
    return obj;
  } catch (error) {
    console.warn("[firebaseAdmin] Found JSON file but failed to read/parse it");
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
let _initializationError: Error | null = null;

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
    return _admin;
  }

  // Get service account credentials
  const serviceAccount = getServiceAccount();

  if (!serviceAccount) {
    const error = new Error(
      isProduction || isVercel
        ? "Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable. Required for production builds."
        : "No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON or use split env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY), or put the JSON file in the project root (development only)."
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
    // Initialize Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

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
