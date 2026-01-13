// lib/firebaseAdmin.ts
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

function tryParseServiceAccountFromEnv(): any | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  const trimmed = raw.trim();

  try {
    const first = JSON.parse(trimmed);

    // Handles the case where the env var is double-encoded:
    // "{\"type\":\"service_account\",...}"
    const obj = typeof first === "string" ? JSON.parse(first) : first;

    if (obj?.private_key && typeof obj.private_key === "string") {
      obj.private_key = obj.private_key.replace(/\\n/g, "\n");
    }

    return obj;
  } catch {
    // Don’t crash here. Fall back to other strategies.
    console.warn("FIREBASE_SERVICE_ACCOUNT_JSON is set but not usable, falling back.");
    return null;
  }
}

function tryBuildServiceAccountFromSplitEnv(): any | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) return null;

  const privateKey = privateKeyRaw
  .replace(/\\n/g, "\n")
  .replace(/\r\n/g, "\n")
  .trim();


  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

function tryLoadServiceAccountFromFile(): any | null {
  // Put your actual filename here
  const filename = "salon-platform-34cec-firebase-adminsdk-fbsvc-f73cb413cd.json";
  const filePath = path.join(process.cwd(), filename);

  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const obj = JSON.parse(raw);

    if (obj?.private_key && typeof obj.private_key === "string") {
      obj.private_key = obj.private_key.replace(/\\n/g, "\n");
    }

    console.log("Loaded Firebase credentials from local JSON file.");
    return obj;
  } catch {
    console.warn("Found Firebase JSON file but failed to read/parse it.");
    return null;
  }
}

function getServiceAccount(): any {
  return (
    tryParseServiceAccountFromEnv() ||
    tryBuildServiceAccountFromSplitEnv() ||
    tryLoadServiceAccountFromFile()
  );
}

const serviceAccount = getServiceAccount();

if (!serviceAccount) {
  throw new Error(
    "No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON, or split env vars, or put the JSON file in the project root."
  );
}

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const adminDb = admin.firestore();
export default admin;
