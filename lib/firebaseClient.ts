"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function missingKeys(cfg: Record<string, string | undefined>) {
  return Object.entries(cfg)
    .filter(([_, v]) => !v || String(v).trim() === "")
    .map(([k]) => k);
}

// Only validate and initialize on the client side
let app: ReturnType<typeof initializeApp> | null = null;
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;

if (typeof window !== "undefined") {
  const missing = missingKeys(firebaseConfig as any);

  if (missing.length) {
    console.error("Firebase env missing:", missing);
    throw new Error("Firebase env missing: " + missing.join(", "));
  }

  app = getApps().length ? getApp() : initializeApp(firebaseConfig as any);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { auth, db, storage };
