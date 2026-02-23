"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import Image from "next/image";
import type { SiteConfig, SiteService } from "@/types/siteConfig";
import type { EditableTarget } from "@/lib/editor/getEditorSchema";
import { getByPath } from "@/lib/editor/configPath";
import { defaultThemeColors } from "@/types/siteConfig";
import { getSectionColorResolved } from "@/lib/sectionStyles";
import { uploadSiteImage, SITE_IMAGE_ACCEPT } from "@/lib/siteImageStorage";
import type { SiteImageType } from "@/lib/siteImageStorage";
import type { SelectedTarget } from "./SelectionOverlay";
import { ImagePickerModal } from "./ImagePickerModal";

type InspectorTab = "text" | "colors" | "images";

/** Label for content/faq paths in inspector */
function getContentPathLabel(path: string): string {
  if (path.startsWith("faqs.")) {
    const match = path.match(/faqs\.(\d+)\.(question|answer)/);
    if (match) {
      const i = parseInt(match[1]!, 10) + 1;
      return match[2] === "question" ? `שאלה ${i}` : `תשובה ${i}`;
    }
    return path.split(".").pop() ?? path;
  }
  const parts = path.replace("content.", "").split(".");
  const key = parts[parts.length - 1] ?? path;
  const labels: Record<string, string> = {
    brandName: "שם בכותרת",
    navAbout: "קישור אודות",
    navServices: "קישור שירותים",
    navGallery: "קישור גלריה",
    navCtaBook: "טקסט כפתור תור",
    navCtaContact: "טקסט כפתור צור קשר",
    tagline: "תגית",
    title: "כותרת",
    subtitle: "תת־כותרת",
    ctaPrimaryText: "כפתור ראשי",
    ctaSecondaryText: "כפתור משני",
    headingLabel: "תווית כותרת",
    headingTitle: "כותרת",
    body: "טקסט",
    chip1: "תגית 1",
    chip2: "תגית 2",
    chip3: "תגית 3",
    sectionTitle: "כותרת מקטע",
    sectionSubtitle: "תיאור מקטע",
    sectionLabel: "תווית",
    placeholderText: "טקסט placeholder",
    copyright: "זכויות יוצרים",
    question: "שאלה",
    answer: "תשובה",
  };
  return labels[key] ?? key;
}

/** Paths that should use textarea (multiline) */
function isMultilinePath(path: string): boolean {
  if (path === "content.about.body") return true;
  if (path.includes(".answer")) return true;
  return false;
}

const COLOR_LABELS: Record<string, string> = {
  background: "רקע",
  bg: "רקע",
  surface: "משטח",
  text: "טקסט",
  mutedText: "טקסט משני",
  primary: "צבע ראשי",
  primaryText: "טקסט על ראשי",
  accent: "דגש",
  border: "מסגרת",
  link: "קישור",
  linkActive: "קישור פעיל",
  linkHover: "קישור בריחוף",
  titleText: "כותרת",
  subtitleText: "תת־כותרת",
  overlayBg: "רקע שכבת כיסוי",
  primaryBtnBg: "רקע כפתור ראשי",
  primaryBtnText: "טקסט כפתור ראשי",
  secondaryBtnBg: "רקע כפתור משני",
  secondaryBtnText: "טקסט כפתור משני",
  cardBg: "רקע כרטיס",
  cardText: "טקסט כרטיס",
  priceText: "טקסט מחיר",
  itemBg: "רקע פריט",
  itemText: "טקסט פריט",
  itemBorder: "מסגרת פריט",
  chipBg: "רקע תגית",
  chipText: "טקסט תגית",
  starColor: "צבע כוכבים",
  buttonBg: "רקע כפתור",
  buttonText: "טקסט כפתור",
};

interface InspectorPanelProps {
  selected: SelectedTarget | null;
  schemaTarget: EditableTarget | null;
  draftConfig: SiteConfig;
  /** Update a single path (e.g. "themeColors.primary", "heroImage", "galleryImages.0"). Parent merges into draft. */
  onPathChange: (path: string, value: unknown) => void;
  onDraftChange: (updates: Partial<SiteConfig>) => void;
  templateKey: string;
  siteId: string;
  /** For service card image: list of services (to show current image + persist via onServiceImageUpload) */
  services?: SiteService[];
  /** When a service card image is replaced, update Firestore services array */
  onServiceImageUpload?: (serviceId: string, url: string) => Promise<void>;
  onClose: () => void;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1]!, 16),
    g: parseInt(m[2]!, 16),
    b: parseInt(m[3]!, 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function InspectorPanel({
  selected,
  schemaTarget,
  draftConfig,
  onPathChange,
  onDraftChange,
  siteId,
  services = [],
  onServiceImageUpload,
  onClose,
}: InspectorPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [replacingPath, setReplacingPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetPath, setPickerTargetPath] = useState<string | null>(null);
  const [pickerTargetServiceId, setPickerTargetServiceId] = useState<string | undefined>(undefined);

  const theme = draftConfig.themeColors ?? defaultThemeColors;

  const updateColor = useCallback(
    (path: string, value: string) => {
      onPathChange(path, value);
    },
    [onPathChange]
  );

  const getImageUploadType = useCallback(
    (path: string): { type: SiteImageType; options?: { serviceId?: string; galleryIndex?: number } } => {
      if (path === "heroImage") return { type: "hero" };
      if (path === "aboutImage") return { type: "about" };
      if (path.startsWith("galleryImages.")) {
        const i = parseInt(path.split(".")[1] ?? "0", 10);
        return { type: "gallery", options: { galleryIndex: Number.isNaN(i) ? 0 : i } };
      }
      if (path === "serviceImage" && selected?.serviceId) {
        return { type: "service", options: { serviceId: selected.serviceId } };
      }
      return { type: "hero" };
    },
    [selected?.serviceId]
  );

  const handleFileSelect = useCallback(
    async (path: string) => {
      const file = fileInputRef.current?.files?.[0];
      if (!file) return;
      setUploadError(null);
      setUploading(true);
      const { type, options } = getImageUploadType(path);
      const result = await uploadSiteImage(siteId, file, type, options);
      setUploading(false);
      if (result.success) {
        if (path === "heroImage" || path === "aboutImage") {
          onDraftChange({ [path]: result.downloadUrl });
        } else if (path.startsWith("galleryImages.")) {
          const idx = parseInt(path.split(".")[1] ?? "0", 10);
          const current = (getByPath(draftConfig, "galleryImages") as string[] | undefined) ?? [];
          const next = [...current];
          while (next.length <= idx) next.push("");
          next[idx] = result.downloadUrl;
          onPathChange("galleryImages", next);
        } else if (path === "serviceImage" && selected?.serviceId && onServiceImageUpload) {
          await onServiceImageUpload(selected.serviceId, result.downloadUrl);
        }
      } else {
        setUploadError(result.error);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      setReplacingPath(null);
    },
    [siteId, draftConfig, onDraftChange, onPathChange, onServiceImageUpload, selected?.serviceId, getImageUploadType]
  );

  const triggerImageReplace = useCallback((path: string) => {
    setReplacingPath(path);
    fileInputRef.current?.click();
  }, []);

  const openImagePicker = useCallback((path: string, serviceId?: string) => {
    setPickerTargetPath(path);
    setPickerTargetServiceId(serviceId);
    setPickerOpen(true);
  }, []);

  const handlePickerSelect = useCallback(
    (url: string) => {
      const path = pickerTargetPath;
      if (!path) return;
      if (path === "heroImage" || path === "aboutImage") {
        onDraftChange({ [path]: url });
      } else if (path.startsWith("galleryImages.")) {
        const idx = parseInt(path.split(".")[1] ?? "0", 10);
        const current = (getByPath(draftConfig, "galleryImages") as string[] | undefined) ?? [];
        const next = [...current];
        while (next.length <= idx) next.push("");
        next[idx] = url;
        onPathChange("galleryImages", next);
      } else if (path === "serviceImage" && pickerTargetServiceId && onServiceImageUpload) {
        onServiceImageUpload(pickerTargetServiceId, url).catch(() => {});
      }
      setPickerOpen(false);
      setPickerTargetPath(null);
      setPickerTargetServiceId(undefined);
    },
    [pickerTargetPath, pickerTargetServiceId, draftConfig, onDraftChange, onPathChange, onServiceImageUpload]
  );

  const handleResetSection = useCallback(() => {
    if (!selected) return;
    const sectionPaths = selected.paths.filter(
      (p): p is string => typeof p === "string" && p.startsWith("sectionStyles.") && p.split(".").length >= 2
    );
    if (sectionPaths.length === 0) return;
    const section = sectionPaths[0]!.split(".")[1] as keyof import("@/types/siteConfig").SectionStyles;
    const current = { ...(draftConfig.sectionStyles ?? {}) };
    delete current[section];
    onDraftChange({ sectionStyles: current });
  }, [selected, draftConfig.sectionStyles, onDraftChange]);

  // Derive from selected (safe when selected is null) – must run before any conditional return so hooks below are unconditional
  const paths = selected?.paths ?? [];
  const contentPaths = paths.filter(
    (p): p is string => typeof p === "string" && (p.startsWith("content.") || p.startsWith("faqs."))
  );
  const colorPaths = paths.filter((p) =>
    typeof p === "string" && (p.startsWith("themeColors.") || p.startsWith("sectionStyles."))
  );
  const imagePaths = paths.filter((p) => {
    if (p === "serviceImage") return !!selected?.serviceId;
    return p === "heroImage" || p === "aboutImage" || (typeof p === "string" && (p === "galleryImages" || p.startsWith("galleryImages.")));
  });
  const kind = (selected?.type ?? schemaTarget?.type) ?? "section";
  const isImage = kind === "image";
  /** Gallery section selected: show whole-gallery editor (count + slots) instead of per-image */
  const isGallery = selected?.id === "gallery" && (kind === "gallery" || paths.includes("galleryImages"));
  const galleryImages = (isGallery ? (getByPath(draftConfig, "galleryImages") as string[] | undefined) : undefined) ?? [];
  const displayLabel = selected ? (selected.label ?? schemaTarget?.label ?? selected.id) : "";
  const sectionPaths = paths.filter(
    (p): p is string => typeof p === "string" && p.startsWith("sectionStyles.") && p.split(".").length >= 2
  );
  const activeSection = sectionPaths.length > 0
    ? sectionPaths[0]!.split(".")[1] as keyof import("@/types/siteConfig").SectionStyles
    : null;

  const tabs = useMemo(() => {
    const t: { id: InspectorTab; label: string }[] = [];
    if (contentPaths.length > 0) t.push({ id: "text", label: "טקסט" });
    if (colorPaths.length > 0) t.push({ id: "colors", label: "צבעים" });
    if (imagePaths.length > 0) t.push({ id: "images", label: "תמונות" });
    return t;
  }, [contentPaths.length, colorPaths.length, imagePaths.length]);

  const defaultTab: InspectorTab =
    contentPaths.length > 0 || kind === "text" ? "text"
    : colorPaths.length > 0 ? "colors"
    : imagePaths.length > 0 ? "images"
    : "text";
  const [activeTab, setActiveTab] = useState<InspectorTab>("text");
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [selected?.id, defaultTab]);

  if (!selected) return null;

  return (
    <div
      className="w-full md:w-80 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden"
      dir="rtl"
    >
      <div className="p-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          {displayLabel}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-100 text-slate-500"
          aria-label="סגור"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {tabs.length > 1 && (
        <div className="flex border-b border-slate-200 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-t transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-caleno-600 border-b-2 border-caleno-500 -mb-px"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Text content: when selected has content paths */}
        {contentPaths.length > 0 && activeTab === "text" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-500">טקסט</p>
            {contentPaths.map((path) => {
              const value = (getByPath(draftConfig, path) as string | undefined) ?? "";
              const label = getContentPathLabel(path);
              const isMultiline = isMultilinePath(path);
              return (
                <div key={path} className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600">{label}</label>
                  {isMultiline ? (
                    <textarea
                      value={value}
                      onChange={(e) => onPathChange(path, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg min-h-[80px] resize-y"
                      rows={4}
                      dir="rtl"
                    />
                  ) : (
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => onPathChange(path, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      dir="rtl"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Color pickers: driven by selected.paths (exact clicked element), not schema */}
        {colorPaths.length > 0 && activeTab === "colors" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-500">צבעים</p>
            {colorPaths.map((path) => {
              let value = getByPath(draftConfig, path) as string | undefined;
              if (value == null && path.startsWith("sectionStyles.")) {
                const parts = path.split(".");
                if (parts.length >= 3) {
                  const section = parts[1] as keyof import("@/types/siteConfig").SectionStyles;
                  const key = parts[2]!;
                  value = getSectionColorResolved(draftConfig, section, key);
                }
              }
              if (value == null && path.startsWith("themeColors.")) {
                const key = path.replace("themeColors.", "") as keyof typeof theme;
                value = theme[key] ?? "#000000";
              }
              value = value ?? "#000000";
              const labelKey = path.includes(".") ? path.split(".").pop()! : path;
              const label = COLOR_LABELS[labelKey] ?? labelKey;
              return (
                <div key={path} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => updateColor(path, e.target.value)}
                    className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{6}$/.test(v) || /^[0-9a-fA-F]{6}$/.test(v)) {
                        updateColor(path, v.startsWith("#") ? v : `#${v}`);
                      }
                    }}
                    className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded"
                    placeholder="#000000"
                  />
                  <span className="text-xs text-slate-600 w-16">{label}</span>
                </div>
              );
            })}
            {activeSection && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleResetSection}
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm font-medium"
                >
                  איפוס צבעי מקטע
                </button>
              </div>
            )}
          </div>
        )}

        {/* Image replace: hero, about, gallery (whole panel), service */}
        {(isImage || imagePaths.length > 0) && activeTab === "images" && (
          <div className="space-y-2">
            {isGallery ? (
              <>
                <p className="text-xs font-medium text-slate-500">גלריה</p>
                <p className="text-xs text-slate-500 italic">
                  אם לא הועלו תמונות — מוצגות תמונות דוגמה מהתבנית.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">כמות תמונות</span>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={galleryImages.length}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const nextCount = raw === "" ? 0 : Math.max(0, Math.min(24, parseInt(raw, 10) || 0));
                      const current = galleryImages;
                      if (nextCount > current.length) {
                        const next = [...current];
                        while (next.length < nextCount) next.push("");
                        onPathChange("galleryImages", next);
                      } else if (nextCount < current.length) {
                        const next = current.slice(0, nextCount);
                        onPathChange("galleryImages", next);
                      }
                    }}
                    className="w-16 px-2 py-1.5 text-sm border border-slate-200 rounded"
                  />
                </div>
                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                  {galleryImages.map((url, index) => (
                    <div key={index} className="flex gap-2 items-start border border-slate-200 rounded-lg p-2 bg-slate-50">
                      <div className="relative w-16 h-16 shrink-0 rounded overflow-hidden bg-slate-200">
                        {url ? (
                          <Image
                            src={url}
                            alt={`תמונה ${index + 1}`}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs">
                            ריק
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => openImagePicker(`galleryImages.${index}`)}
                          className="w-full px-2 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium"
                        >
                          בחר תמונה
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = galleryImages.filter((_, i) => i !== index);
                            onPathChange("galleryImages", next);
                          }}
                          className="w-full px-2 py-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50 text-sm"
                        >
                          הסר
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-slate-500">תמונה</p>
                {imagePaths.filter((p) => p !== "galleryImages").map((path) => {
                  const url =
                    path === "serviceImage" && selected?.serviceId
                      ? (services.find((s) => s.id === selected.serviceId)?.imageUrl as string) ?? ""
                      : (getByPath(draftConfig, path) as string) || "";
                  const label =
                    path === "heroImage"
                      ? "תמונת קאבר (Hero)"
                      : path === "aboutImage"
                        ? "תמונת אודות"
                        : path.startsWith("galleryImages.")
                          ? `תמונת גלריה ${(path.split(".")[1] ?? "0")}`
                          : path === "serviceImage"
                            ? "תמונת שירות"
                            : path;
                  return (
                    <div key={path} className="space-y-2">
                      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                        {url ? (
                          <Image
                            src={url}
                            alt={label}
                            fill
                            className="object-cover"
                            sizes="280px"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                            אין תמונה
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          openImagePicker(
                            path,
                            path === "serviceImage" ? selected?.serviceId : undefined
                          )
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium"
                      >
                        בחר תמונה
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {pickerOpen && pickerTargetPath && (
          <ImagePickerModal
            isOpen={pickerOpen}
            onClose={() => {
              setPickerOpen(false);
              setPickerTargetPath(null);
              setPickerTargetServiceId(undefined);
            }}
            siteId={siteId}
            targetPath={pickerTargetPath}
            targetServiceId={pickerTargetServiceId}
            onSelect={handlePickerSelect}
          />
        )}
      </div>
    </div>
  );
}
