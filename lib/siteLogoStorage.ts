"use client";

import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { getClientStorage } from "@/lib/firebaseClient";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

export type LogoUploadResult = { success: true; downloadUrl: string } | { success: false; error: string };

/**
 * Validate logo file: type (PNG/JPG/SVG/WEBP) and size (max 2MB).
 */
export function validateLogoFile(file: File): string | null {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return "סוג קובץ לא נתמך. השתמש ב-PNG, JPG, SVG או WEBP.";
  }
  if (file.size > MAX_SIZE_BYTES) {
    return "גודל הקובץ חורג מ-2MB.";
  }
  return null;
}

/**
 * Upload logo to Firebase Storage at sites/{siteId}/branding/logo.{ext}
 * and return the download URL. Client-side only.
 */
export async function uploadSiteLogo(siteId: string, file: File): Promise<LogoUploadResult> {
  if (typeof window === "undefined") {
    return { success: false, error: "העלאת לוגו זמינה רק בדפדפן." };
  }
  const err = validateLogoFile(file);
  if (err) return { success: false, error: err };

  const ext = ALLOWED_TYPES[file.type] || "png";
  const path = `sites/${siteId}/branding/logo.${ext}`;

  try {
    const storage = getClientStorage();
    const storageRef = ref(storage, path);
    await uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      cacheControl: "public, max-age=31536000",
    });
    const downloadUrl = await getDownloadURL(storageRef);
    return { success: true, downloadUrl };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[siteLogoStorage] Upload failed:", e);
    return { success: false, error: message || "העלאת הלוגו נכשלה." };
  }
}
