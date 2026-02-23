"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { getPlatformTemplateImages, getPlatformGroupLabel } from "@/lib/platformImageLibrary";
import { uploadSiteImage, SITE_IMAGE_ACCEPT } from "@/lib/siteImageStorage";
import type { SiteImageType } from "@/lib/siteImageStorage";

type PickerTab = "upload" | "platform";

function getUploadType(
  targetPath: string,
  targetServiceId?: string,
  targetReviewId?: string
): { type: SiteImageType; options?: { serviceId?: string; galleryIndex?: number; reviewId?: string } } {
  if (targetPath === "heroImage") return { type: "hero" };
  if (targetPath === "aboutImage") return { type: "about" };
  if (targetPath.startsWith("galleryImages.")) {
    const i = parseInt(targetPath.split(".")[1] ?? "0", 10);
    return { type: "gallery", options: { galleryIndex: Number.isNaN(i) ? 0 : i } };
  }
  if (targetPath === "serviceImage" && targetServiceId) {
    return { type: "service", options: { serviceId: targetServiceId } };
  }
  if (targetPath === "reviewAvatar") {
    return { type: "review", options: { reviewId: targetReviewId } };
  }
  return { type: "hero" };
}

export interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  targetPath: string;
  targetServiceId?: string;
  /** For review avatar upload (targetPath "reviewAvatar") */
  targetReviewId?: string;
  /** When true, only show the upload tab (no platform gallery tab). Used for reviews avatar. */
  uploadOnly?: boolean;
  onSelect: (url: string) => void;
}

export function ImagePickerModal({
  isOpen,
  onClose,
  siteId,
  targetPath,
  targetServiceId,
  targetReviewId,
  uploadOnly = false,
  onSelect,
}: ImagePickerModalProps) {
  const [activeTab, setActiveTab] = useState<PickerTab>(uploadOnly ? "upload" : "platform");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [failedPlatformUrls, setFailedPlatformUrls] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const platformTemplateImages = isOpen && !uploadOnly ? getPlatformTemplateImages("hair") : [];

  const handlePlatformImageError = useCallback((url: string) => {
    if (process.env.NODE_ENV === "development") {
      console.warn("[ImagePickerModal] Platform image failed to load:", url);
    }
    setFailedPlatformUrls((prev) => new Set(prev).add(url));
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && isOpen && platformTemplateImages.length > 0) {
      console.log("[ImagePickerModal] Platform gallery:", platformTemplateImages.length, "images (hero + about + work)");
    }
  }, [isOpen, platformTemplateImages.length]);

  useEffect(() => {
    if (isOpen) setFailedPlatformUrls(new Set());
  }, [isOpen, targetPath]);

  const handleFileChange = useCallback(() => {
    const file = fileInputRef.current?.files?.[0];
    setSelectedFile(file ?? null);
    setUploadError(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploadError(null);
    setUploading(true);
    const { type, options } = getUploadType(targetPath, targetServiceId, targetReviewId);
    const result = await uploadSiteImage(siteId, selectedFile, type, options);
    setUploading(false);
    if (result.success) {
      onSelect(result.downloadUrl);
      onClose();
    } else {
      setUploadError(result.error);
    }
    setSelectedFile(null);
    fileInputRef.current.value = "";
  }, [siteId, targetPath, targetServiceId, targetReviewId, selectedFile, onSelect, onClose]);

  const handleChoosePlatform = useCallback(
    (url: string) => {
      if (typeof url === "string" && url.startsWith("/")) {
        onSelect(url);
        onClose();
      }
    },
    [onSelect, onClose]
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-picker-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden"
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id="image-picker-title" className="text-lg font-semibold text-slate-900">
            בחר תמונה
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="סגור"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!uploadOnly && (
          <div className="flex border-b border-slate-200 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`flex-1 min-w-0 px-2 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === "upload"
                  ? "bg-white text-caleno-600 border-b-2 border-caleno-500 -mb-px"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              העלאה
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("platform")}
              className={`flex-1 min-w-0 px-2 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === "platform"
                  ? "bg-white text-caleno-600 border-b-2 border-caleno-500 -mb-px"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              מאגר הפלטפורמה
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {(uploadOnly || activeTab === "upload") ? (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept={SITE_IMAGE_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-slate-200 hover:border-slate-300 text-slate-600 text-sm font-medium"
              >
                בחר קובץ מהמכשיר
              </button>
              {selectedFile && (
                <p className="text-xs text-slate-500">
                  נבחר: {selectedFile.name}
                </p>
              )}
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className="w-full px-4 py-2.5 rounded-lg bg-caleno-600 hover:bg-caleno-700 text-white font-medium disabled:opacity-50 disabled:pointer-events-none"
              >
                {uploading ? "מעלה…" : "העלה והשתמש"}
              </button>
              {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                תמונות דוגמה מהתבנית (הירו, אודות, עבודות). לחיצה תבחר את התמונה.
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {platformTemplateImages.map((item) => {
                  const failed = failedPlatformUrls.has(item.url);
                  return (
                    <button
                      key={item.url}
                      type="button"
                      onClick={() => !failed && handleChoosePlatform(item.url)}
                      className="relative aspect-square rounded-lg overflow-hidden border-2 border-slate-200 hover:border-caleno-500 hover:ring-2 hover:ring-caleno-200 focus:outline-none focus:ring-2 focus:ring-caleno-500"
                    >
                      {failed ? (
                        <div
                          className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 text-xs"
                          title={item.url}
                        >
                          {process.env.NODE_ENV === "development" ? "לא נטען" : ""}
                        </div>
                      ) : (
                        <img
                          src={item.url}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={() => handlePlatformImageError(item.url)}
                        />
                      )}
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs py-0.5 px-1 truncate">
                        {getPlatformGroupLabel(item.group)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
