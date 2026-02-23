"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { SiteConfig, SiteService } from "@/types/siteConfig";
import { defaultThemeColors } from "@/types/siteConfig";
import WebsiteRenderer from "@/components/site/WebsiteRenderer";
import { SelectionOverlay, type SelectedTarget } from "@/components/editor/SelectionOverlay";
import { InspectorPanel } from "@/components/editor/InspectorPanel";
import { getEditorSchema, getEditableTarget } from "@/lib/editor/getEditorSchema";
import { setByPath } from "@/lib/editor/configPath";
import { subscribeSiteServices, migrateServicesFromSubcollection, updateSiteService } from "@/lib/firestoreSiteServices";

const TEMPLATE_KEY = "hair1";

interface VisualSiteEditorProps {
  siteId: string;
  baselineConfig: SiteConfig;
  onSave: (config: SiteConfig) => void;
  onBack: () => void;
  isSaving?: boolean;
  saveMessage?: string;
}

export function VisualSiteEditor({
  siteId,
  baselineConfig,
  onSave,
  onBack,
  isSaving = false,
  saveMessage,
}: VisualSiteEditorProps) {
  const [draft, setDraft] = useState<SiteConfig>(() => ({
    ...baselineConfig,
    themeColors: baselineConfig.themeColors ?? defaultThemeColors,
  }));
  const [selected, setSelected] = useState<SelectedTarget | null>(null);
  const [services, setServices] = useState<SiteService[]>([]);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Load services for WebsiteRenderer
  useEffect(() => {
    if (!siteId) return;
    migrateServicesFromSubcollection(siteId).catch(() => {});
    const unsub = subscribeSiteServices(
      siteId,
      (svcs) => {
        const enabled = (svcs ?? [])
          .filter((s) => s?.enabled !== false)
          .sort((a, b) => {
            if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder;
            return (a.name ?? "").localeCompare(b.name ?? "");
          });
        setServices(enabled);
      },
      () => setServices([])
    );
    return () => unsub();
  }, [siteId]);

  const handlePathChange = useCallback((path: string, value: unknown) => {
    setDraft((prev) => setByPath(prev, path, value) as SiteConfig);
  }, []);

  const handleDraftChange = useCallback((updates: Partial<SiteConfig>) => {
    setDraft((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const handleServiceImageUpload = useCallback(
    async (serviceId: string, url: string) => {
      await updateSiteService(siteId, serviceId, { imageUrl: url });
      // Services state will update via subscribeSiteServices
    },
    [siteId]
  );

  const handleDiscard = useCallback(() => {
    setDraft({
      ...baselineConfig,
      themeColors: baselineConfig.themeColors ?? defaultThemeColors,
    });
    setSelected(null);
  }, [baselineConfig]);

  const handleSave = useCallback(() => {
    onSave(draft);
  }, [draft, onSave]);

  /** Find deepest element with data-edit-id (walk from target up to container). */
  const findDeepestEditable = useCallback(
    (start: EventTarget | null): HTMLElement | null => {
      const container = previewContainerRef.current;
      if (!container || !(start instanceof Node)) return null;
      let el: Node | null = start;
      while (el && el !== container) {
        if (el instanceof HTMLElement && el.hasAttribute("data-edit-id")) return el;
        el = el.parentElement;
      }
      return null;
    },
    []
  );

  /** Safe parse of data-edit-paths JSON; falls back to comma-separated or single path. */
  const parsePathsFromElement = useCallback((el: HTMLElement): string[] => {
    const pathsAttr = el.getAttribute("data-edit-paths");
    const propsAttr = el.getAttribute("data-edit-props");
    const pathAttr = el.getAttribute("data-edit-path");
    if (pathsAttr) {
      try {
        const parsed = JSON.parse(pathsAttr);
        if (Array.isArray(parsed)) {
          const out = parsed.filter((x): x is string => typeof x === "string");
          if (out.length > 0) return out;
        }
      } catch {
        // invalid JSON, fall through
      }
    }
    if (pathAttr) return [pathAttr.trim()];
    if (propsAttr) return propsAttr.split(",").map((p) => p.trim()).filter(Boolean);
    return [];
  }, []);

  const buildSelectedTarget = useCallback(
    (el: HTMLElement): SelectedTarget | null => {
      const container = previewContainerRef.current;
      if (!container) return null;
      const id = el.getAttribute("data-edit-id");
      if (!id) return null;
      const type = el.getAttribute("data-edit-type") ?? el.getAttribute("data-edit-kind") ?? "section";
      const paths = parsePathsFromElement(el);
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const rect = {
        top: elRect.top - containerRect.top + container.scrollTop,
        left: elRect.left - containerRect.left + container.scrollLeft,
        width: elRect.width,
        height: elRect.height,
      };
      const label =
        el.getAttribute("data-edit-label") ??
        (getEditableTarget(TEMPLATE_KEY, id)?.label ?? id);
      const serviceId = el.getAttribute("data-edit-service-id") ?? undefined;
      const imageIndexAttr = el.getAttribute("data-edit-image-index") ?? el.getAttribute("data-edit-index");
      const imageIndex = imageIndexAttr != null ? parseInt(imageIndexAttr, 10) : undefined;
      const imageIndexValid = imageIndex !== undefined && !Number.isNaN(imageIndex) && imageIndex >= 0 ? imageIndex : undefined;
      return { id, type, paths, rect, label, serviceId, imageIndex: imageIndexValid };
    },
    [parsePathsFromElement]
  );

  const [hovered, setHovered] = useState<SelectedTarget | null>(null);

  // Editor mode: block all interactions (capture phase) and handle selection + hover
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const target = findDeepestEditable(e.target);
      if (target) {
        const next = buildSelectedTarget(target);
        setSelected(next);
      } else {
        setSelected(null);
      }
    };

    const handleSubmit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const role = target.getAttribute?.("role");
      const tagName = target.tagName?.toLowerCase();
      const isButtonOrLink =
        tagName === "button" ||
        tagName === "a" ||
        role === "button" ||
        role === "link";
      if (isButtonOrLink && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    container.addEventListener("click", handleClick, { capture: true });
    container.addEventListener("submit", handleSubmit, { capture: true });
    container.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      container.removeEventListener("click", handleClick, { capture: true });
      container.removeEventListener("submit", handleSubmit, { capture: true });
      container.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [findDeepestEditable, buildSelectedTarget]);

  const handlePreviewMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = findDeepestEditable(e.target);
      if (target) {
        const next = buildSelectedTarget(target);
        setHovered(next);
      } else {
        setHovered(null);
      }
    },
    [findDeepestEditable, buildSelectedTarget]
  );

  const handlePreviewMouseLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const schemaTarget = selected ? getEditableTarget(TEMPLATE_KEY, selected.id) : null;

  return (
    <div className="flex flex-col h-full min-h-0" dir="rtl">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            חזרה
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            איפוס לשמור האחרון
          </button>
        </div>
        <div className="flex items-center gap-3">
          {saveMessage && (
            <span className="text-xs text-emerald-600">{saveMessage}</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg bg-caleno-500 hover:bg-caleno-600 disabled:bg-caleno-300 disabled:cursor-not-allowed text-white text-sm font-semibold"
          >
            {isSaving ? "שומר…" : "שמור שינויים"}
          </button>
        </div>
      </div>

      {/* Main: preview + inspector */}
      <div className="flex-1 flex min-h-0">
        {/* Preview canvas */}
        <div
          ref={previewContainerRef}
          className="flex-1 min-w-0 overflow-auto relative bg-slate-100 cursor-pointer"
          onMouseMove={handlePreviewMouseMove}
          onMouseLeave={handlePreviewMouseLeave}
          role="button"
          tabIndex={0}
          aria-label="לחץ לבחירת אלמנט לעריכה"
        >
          <div className="min-h-full inline-block">
            <WebsiteRenderer
              templateKey={TEMPLATE_KEY}
              siteConfig={draft}
              mode="editor"
              siteId={siteId}
              services={services}
            />
          </div>
          <SelectionOverlay
            selected={selected}
            containerRef={previewContainerRef}
            hovered={hovered}
          />
        </div>

        {/* Inspector */}
        <InspectorPanel
          selected={selected}
          schemaTarget={schemaTarget ?? null}
          draftConfig={draft}
          onPathChange={handlePathChange}
          onDraftChange={handleDraftChange}
          templateKey={TEMPLATE_KEY}
          siteId={siteId}
          services={services}
          onServiceImageUpload={handleServiceImageUpload}
          onClose={() => setSelected(null)}
        />
      </div>
    </div>
  );
}
