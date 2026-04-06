"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { motion, useMotionValue, useDragControls, animate } from "framer-motion";
import { GripHorizontal, Pencil, Eye, Check, LogOut } from "lucide-react";
import type { SiteConfig, SiteService, ThemePalette } from "@/types/siteConfig";
import { defaultThemeColors, defaultThemePalette } from "@/types/siteConfig";
import { resolveThemePalette } from "@/lib/themePalette";
import WebsiteRenderer from "@/components/site/WebsiteRenderer";
import { SelectionOverlay, type SelectedTarget } from "@/components/editor/SelectionOverlay";
import { InspectorPanel } from "@/components/editor/InspectorPanel";
import { ThemePalettePanel } from "@/components/editor/ThemePalettePanel";
import { getEditableTarget } from "@/lib/editor/getEditorSchema";
import { setByPath } from "@/lib/editor/configPath";
import { subscribeSiteServices, migrateServicesFromSubcollection, updateSiteService } from "@/lib/firestoreSiteServices";

const TEMPLATE_KEY = "hair1";

export interface VisualSiteEditorHandle {
  getDraft: () => SiteConfig | null;
  markSaved: () => void;
}

interface VisualSiteEditorProps {
  siteId: string;
  baselineConfig: SiteConfig;
  onSave: (config: SiteConfig) => void | Promise<void>;
  onBack?: () => void;
  isSaving?: boolean;
  saveMessage?: string;
  /** When true, hide back and save buttons (parent uses single save for all tabs). */
  hideToolbarSaveAndBack?: boolean;
  /** Called when the editor draft has unsaved changes (for leave confirmation). */
  onDirtyChange?: (dirty: boolean) => void;
  /** For logo upload in inspector: get auth token for Cloudinary sign */
  getToken?: () => Promise<string | null>;
  /** Mobile sheet: leave editor (e.g. back to site settings tabs). */
  onRequestExit?: () => void;
}

export const VisualSiteEditor = forwardRef<VisualSiteEditorHandle, VisualSiteEditorProps>(function VisualSiteEditor({
  siteId,
  baselineConfig,
  onSave,
  onBack,
  isSaving = false,
  saveMessage,
  hideToolbarSaveAndBack = false,
  onDirtyChange,
  getToken,
  onRequestExit,
}, ref) {
  const [draft, setDraft] = useState<SiteConfig>(() => ({
    ...baselineConfig,
    themeColors: baselineConfig.themeColors ?? defaultThemeColors,
    themePalette: {
      ...defaultThemePalette,
      ...baselineConfig.themePalette,
    },
  }));
  const [selected, setSelected] = useState<SelectedTarget | null>(null);
  const [services, setServices] = useState<SiteService[]>([]);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  /** State (not ref) so clearing dirty after save re-renders and updates leave guards */
  const [draftDirty, setDraftDirty] = useState(false);

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
    setDraftDirty(true);
    setDraft((prev) => setByPath(prev, path, value) as SiteConfig);
  }, []);

  const handleDraftChange = useCallback((updates: Partial<SiteConfig>) => {
    setDraftDirty(true);
    setDraft((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const handlePaletteColorChange = useCallback((key: keyof ThemePalette, hex: string) => {
    setDraftDirty(true);
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        themePalette: { ...resolveThemePalette(prev), [key]: hex },
      };
    });
  }, []);

  const handleServiceImageUpload = useCallback(
    async (serviceId: string, url: string) => {
      await updateSiteService(siteId, serviceId, { imageUrl: url });
      // Services state will update via subscribeSiteServices
    },
    [siteId]
  );

  const handleDiscard = useCallback(() => {
    setDraftDirty(false);
    setDraft({
      ...baselineConfig,
      themeColors: baselineConfig.themeColors ?? defaultThemeColors,
      themePalette: {
        ...defaultThemePalette,
        ...baselineConfig.themePalette,
      },
    });
    setSelected(null);
  }, [baselineConfig]);

  const hasUnsavedChanges = useMemo(() => {
    if (!draftDirty) return false;
    const base = {
      ...baselineConfig,
      themeColors: baselineConfig.themeColors ?? defaultThemeColors,
      themePalette: {
        ...defaultThemePalette,
        ...baselineConfig.themePalette,
      },
    };
    return JSON.stringify(draft) !== JSON.stringify(base);
  }, [draftDirty, draft, baselineConfig]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  const handleSave = useCallback(async () => {
    try {
      await Promise.resolve(onSave(draft));
      setDraftDirty(false);
    } catch {
      /* parent save failed — keep dirty */
    }
  }, [draft, onSave]);

  useImperativeHandle(
    ref,
    () => ({
      getDraft: () => draft ?? null,
      /** Call after a successful save from the parent (e.g. top bar) so leave guards clear */
      markSaved: () => setDraftDirty(false),
    }),
    [draft]
  );

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
      const domPaths = parsePathsFromElement(el);
      const schemaTarget = getEditableTarget(TEMPLATE_KEY, id);
      const schemaPaths = schemaTarget?.editablePaths ?? [];
      const paths = Array.from(new Set([...domPaths, ...schemaPaths]));
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

  const [isMobile, setIsMobile] = useState(false);
  const [viewportH, setViewportH] = useState(800);
  const [mobileSheet, setMobileSheet] = useState<"preview" | "edit">("edit");
  const [sheetOffsetY, setSheetOffsetY] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onMq = () => setIsMobile(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const sheetHeight = useMemo(() => Math.round(viewportH * 0.88), [viewportH]);
  const peekY = useMemo(() => Math.max(0, sheetHeight - 56), [sheetHeight]);
  const halfY = useMemo(
    () => Math.max(0, sheetHeight - Math.round(viewportH * 0.5)),
    [sheetHeight, viewportH]
  );

  /** תצוגה only minimizes the inspector sheet; preview stays editor semantics (no live links). */
  const sheetY = useMotionValue(0);
  const dragControls = useDragControls();
  const sheetInitializedRef = useRef(false);

  const snapToNearest = useCallback(
    (current: number) => {
      const snaps = [0, halfY, peekY];
      let best = snaps[0]!;
      let bestDist = Math.abs(current - best);
      for (const s of snaps) {
        const d = Math.abs(current - s);
        if (d < bestDist) {
          best = s;
          bestDist = d;
        }
      }
      return best;
    },
    [halfY, peekY]
  );

  const settleSheetY = useCallback(
    (target: number) => {
      animate(sheetY, target, { type: "spring", stiffness: 420, damping: 42 });
      setSheetOffsetY(target);
    },
    [sheetY]
  );

  useEffect(() => {
    if (!isMobile) {
      sheetInitializedRef.current = false;
      return;
    }
    if (!sheetInitializedRef.current) {
      sheetY.set(halfY);
      setSheetOffsetY(halfY);
      sheetInitializedRef.current = true;
      return;
    }
    const clamped = Math.min(peekY, Math.max(0, sheetY.get()));
    sheetY.set(clamped);
    setSheetOffsetY(clamped);
  }, [isMobile, halfY, peekY, sheetY]);

  const prevMobileSheetRef = useRef(mobileSheet);
  useEffect(() => {
    if (!isMobile) {
      prevMobileSheetRef.current = mobileSheet;
      return;
    }
    if (prevMobileSheetRef.current === "preview" && mobileSheet === "edit") {
      settleSheetY(halfY);
    }
    prevMobileSheetRef.current = mobileSheet;
  }, [isMobile, mobileSheet, halfY, settleSheetY]);

  useEffect(() => {
    if (!isMobile || mobileSheet !== "preview") return;
    settleSheetY(peekY);
  }, [isMobile, mobileSheet, peekY, settleSheetY]);

  const onSheetDragEnd = useCallback(() => {
    if (!isMobile || mobileSheet === "preview") return;
    const target = snapToNearest(sheetY.get());
    settleSheetY(target);
  }, [isMobile, mobileSheet, sheetY, snapToNearest, settleSheetY]);

  const handleMobileDone = useCallback(async () => {
    try {
      await Promise.resolve(onSave(draft));
      setDraftDirty(false);
      settleSheetY(peekY);
    } catch {
      /* save failed — keep sheet open */
    }
  }, [draft, onSave, settleSheetY, peekY]);

  useLayoutEffect(() => {
    if (!isMobile || !selected || !previewContainerRef.current) return;
    const container = previewContainerRef.current;
    const sheetTop = viewportH - (sheetHeight - sheetOffsetY);
    const margin = 20;
    const cRect = container.getBoundingClientRect();
    const elTopVp = cRect.top + selected.rect.top - container.scrollTop;
    const elBottomVp = elTopVp + selected.rect.height;

    if (elBottomVp > sheetTop - margin) {
      const delta = elBottomVp - (sheetTop - margin);
      container.scrollTop += delta;
    } else if (elTopVp < cRect.top + margin) {
      const delta = cRect.top + margin - elTopVp;
      container.scrollTop = Math.max(0, container.scrollTop - delta);
    }
  }, [selected, sheetOffsetY, isMobile, viewportH, sheetHeight]);

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
        if (isMobile && mobileSheet === "preview" && next) {
          setMobileSheet("edit");
        }
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
  }, [findDeepestEditable, buildSelectedTarget, isMobile, mobileSheet]);

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

  const showDesktopEditorBar = !isMobile || !hideToolbarSaveAndBack;

  const themePanel = (
    <ThemePalettePanel draftConfig={draft} onPaletteChange={handlePaletteColorChange} />
  );

  const inspectorPanel = (
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
      getToken={getToken}
      onClose={() => setSelected(null)}
    />
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col" dir="rtl">
      {/* Top bar — hidden on mobile when parent provides the tab/save bar */}
      {showDesktopEditorBar ? (
        <div
          className={`shrink-0 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 ${
            hideToolbarSaveAndBack ? "py-2" : "py-3"
          }`}
        >
          <div className="flex items-center gap-2">
            {!hideToolbarSaveAndBack && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                חזרה
              </button>
            )}
            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={handleDiscard}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                איפוס לשמור האחרון
              </button>
            )}
          </div>
          {!hideToolbarSaveAndBack && (
            <div className="flex items-center gap-3">
              {saveMessage && <span className="text-xs text-emerald-600">{saveMessage}</span>}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="rounded-lg bg-caleno-ink px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "שומר…" : "שמור שינויים"}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Main: preview + desktop inspector */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row md:min-h-[50vh]">
        <div
          ref={previewContainerRef}
          data-visual-site-editor-preview=""
          className="relative min-h-0 w-full min-w-0 flex-1 cursor-pointer overflow-auto bg-slate-100 md:min-h-[45vh]"
          onMouseMove={handlePreviewMouseMove}
          onMouseLeave={handlePreviewMouseLeave}
          role="button"
          tabIndex={0}
          aria-label="לחץ לבחירת אלמנט לעריכה"
        >
          <div className="inline-block min-h-full min-w-full md:min-w-0">
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

        {!isMobile ? (
          <div className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
            {themePanel}
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{inspectorPanel}</div>
          </div>
        ) : null}
      </div>

      {/* Mobile: draggable inspector sheet (תצוגה = locked at peek; עריכה = full drag range) */}
      {isMobile ? (
        <motion.div
          className="fixed inset-x-0 bottom-0 z-[44] flex flex-col overflow-hidden rounded-t-[32px] border border-white/50 border-b-0 bg-white/85 shadow-[0_-12px_48px_rgba(15,23,42,0.14)] backdrop-blur-xl md:hidden"
          style={{ height: sheetHeight, y: sheetY }}
          drag={mobileSheet === "preview" ? false : "y"}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={
            mobileSheet === "preview"
              ? { top: peekY, bottom: peekY }
              : { top: 0, bottom: peekY }
          }
          dragElastic={mobileSheet === "preview" ? undefined : { top: 0.06, bottom: 0.12 }}
          onDrag={mobileSheet === "preview" ? undefined : () => setSheetOffsetY(sheetY.get())}
          onDragEnd={onSheetDragEnd}
        >
          <div
            className="shrink-0 touch-none select-none border-b border-slate-200/60 bg-white/60 px-3 pb-2 pt-2"
            onPointerDown={(e) => {
              if (mobileSheet === "edit") dragControls.start(e);
            }}
          >
            <div className="mx-auto mb-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-400/55" aria-hidden />
            <div className="flex items-center justify-between gap-2" dir="rtl">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => void handleMobileDone()}
                disabled={isSaving}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0F172A] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#1E293B] disabled:opacity-50"
                title="שמירה וסגירת הלוח"
              >
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                שמור
              </button>
              <div className="flex min-w-0 flex-col items-center text-slate-400">
                <GripHorizontal className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              </div>
              <div className="flex min-w-[4.75rem] shrink-0 flex-col items-end gap-1.5">
                {hasUnsavedChanges ? (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={handleDiscard}
                    className="rounded-xl border border-slate-200/90 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    איפוס
                  </button>
                ) : null}
                {onRequestExit ? (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={onRequestExit}
                    className="flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 opacity-90 hover:bg-slate-50 hover:opacity-100"
                    aria-label="יציאה מהעורך"
                  >
                    <LogOut className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                    יציאה
                  </button>
                ) : !hasUnsavedChanges ? (
                  <span className="text-[11px] text-slate-400">גרור</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white/50">
            {themePanel}
            <div className="min-h-0 flex-1 overflow-y-auto">{inspectorPanel}</div>
          </div>
        </motion.div>
      ) : null}

      {/* Mobile: preview vs edit */}
      {isMobile ? (
        <div
          className="pointer-events-none fixed left-1/2 z-[50] -translate-x-1/2 md:hidden"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <div
            className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-slate-200/90 bg-white/95 p-1 shadow-lg shadow-slate-900/10 backdrop-blur-md"
            role="group"
            aria-label="מצב תצוגה"
          >
            <button
              type="button"
              onClick={() => setMobileSheet("edit")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                mobileSheet === "edit"
                  ? "bg-caleno-deep text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100/80"
              }`}
              aria-pressed={mobileSheet === "edit"}
            >
              <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
              עריכה
            </button>
            <button
              type="button"
              onClick={() => setMobileSheet("preview")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                mobileSheet === "preview"
                  ? "bg-caleno-deep text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100/80"
              }`}
              aria-pressed={mobileSheet === "preview"}
            >
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
              תצוגה
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
