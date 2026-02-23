"use client";

import { getClientAuth } from "@/lib/firebaseClient";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

/** Accept string for <input accept=""> — broad for mobile Photos/Files */
export const SITE_IMAGE_ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/*";

export type SiteImageType = "hero" | "about" | "gallery" | "service" | "review";

export type SiteImageUploadOptions = {
  /** For type "service": the service document id */
  serviceId?: string;
  /** For type "gallery": index in galleryImages array */
  galleryIndex?: number;
  /** For type "review": the review item id (for profile avatar) */
  reviewId?: string;
};

export type SiteImageUploadResult =
  | { success: true; downloadUrl: string }
  | { success: false; error: string };

/** Infer file extension from MIME type or filename (mobile Photos/Files often send generic type). */
function inferExtension(file: File): string {
  const fromType = ALLOWED_TYPES[file.type];
  if (fromType) return fromType;
  const name = (file.name || "").toLowerCase();
  if (/\.(png|jpe?g|webp)$/i.test(name)) {
    const m = name.match(/\.(png|jpe?g|webp)$/i);
    if (m) {
      const ext = m[1]!.toLowerCase();
      return ext === "jpg" || ext === "jpeg" ? "jpg" : ext;
    }
  }
  if (file.type && file.type.startsWith("image/")) return "jpg";
  return "jpg";
}

export function validateSiteImageFile(file: File): string | null {
  const isImage =
    ALLOWED_TYPES[file.type] ||
    (file.type && file.type.startsWith("image/")) ||
    /\.(png|jpe?g|webp)$/i.test(file.name || "");
  if (!isImage && !ALLOWED_TYPES[file.type]) {
    return "סוג קובץ לא נתמך. השתמש ב-PNG, JPG או WEBP.";
  }
  if (file.size > MAX_SIZE_BYTES) {
    return "גודל הקובץ חורג מ-10MB.";
  }
  return null;
}

/**
 * Upload image via Next.js API → Cloudinary. Saves no data to Firebase Storage.
 * Returns the Cloudinary secure_url; caller persists it to Firestore config.
 */
export async function uploadSiteImage(
  siteId: string,
  file: File,
  type: SiteImageType,
  options?: SiteImageUploadOptions
): Promise<SiteImageUploadResult> {
  if (typeof window === "undefined") {
    return { success: false, error: "העלאת תמונה זמינה רק בדפדפן." };
  }
  const err = validateSiteImageFile(file);
  if (err) return { success: false, error: err };

  try {
    const auth = getClientAuth();
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "יש להתחבר כדי להעלות תמונה." };
    }
    const token = await user.getIdToken();

    const formData = new FormData();
    formData.append("file", file);
    formData.append("siteId", siteId);
    formData.append("section", type);
    if (type === "gallery" && options?.galleryIndex != null) {
      formData.append("galleryIndex", String(options.galleryIndex));
    }
    if (type === "service" && options?.serviceId) {
      formData.append("serviceId", options.serviceId);
    }
    if (type === "review" && options?.reviewId) {
      formData.append("reviewId", options.reviewId);
    }

    const res = await fetch("/api/upload-image", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data.error || "העלאת התמונה נכשלה.";
      return { success: false, error: message };
    }
    const url = data.url;
    if (typeof url !== "string" || !url) {
      return { success: false, error: "תגובה לא תקינה מהשרת." };
    }
    return { success: true, downloadUrl: url };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[siteImageStorage] Upload failed:", e);
    return { success: false, error: message || "העלאת התמונה נכשלה." };
  }
}
