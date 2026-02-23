"use client";

export interface SelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface SelectedTarget {
  id: string;
  type: string;
  paths: string[];
  rect: SelectionRect;
  label?: string;
  /** For service card image: which service to update (sites/{siteId}.services[i]) */
  serviceId?: string;
  /** For gallery image: which index in config.galleryImages */
  imageIndex?: number;
}

interface SelectionOverlayProps {
  selected: SelectedTarget | null;
  containerRef: React.RefObject<HTMLElement | null>;
  /** Hovered target: show dashed highlight + tooltip */
  hovered?: SelectedTarget | null;
}

const PADDING = 4;

function OverlayBox({
  target,
  variant,
}: {
  target: SelectedTarget;
  variant: "selected" | "hovered";
}) {
  const { rect, label, id } = target;
  const isHover = variant === "hovered";
  return (
    <div
      className={`pointer-events-none absolute z-50 transition-[top,left,width,height] duration-100 ${
        isHover ? "z-40" : ""
      }`}
      style={{
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
        boxSizing: "content-box",
      }}
      aria-hidden
    >
      <div
        className={`absolute inset-0 rounded ${
          isHover
            ? "border-2 border-dashed border-caleno-400 bg-caleno-400/5"
            : "border-2 border-caleno-500 bg-caleno-500/10"
        }`}
        style={{ boxShadow: isHover ? "none" : "0 0 0 1px rgba(255,255,255,0.5)" }}
      />
      <div
        className={`absolute -top-7 right-0 px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
          isHover ? "bg-slate-600 text-white" : "bg-caleno-500 text-white"
        }`}
        data-selection-badge
      >
        {isHover ? `עריכת ${label ?? id}` : (label ?? id)}
      </div>
    </div>
  );
}

export function SelectionOverlay({
  selected,
  containerRef,
  hovered = null,
}: SelectionOverlayProps) {
  if (!containerRef.current) return null;

  return (
    <>
      {hovered && (
        <OverlayBox target={hovered} variant="hovered" />
      )}
      {selected && <OverlayBox target={selected} variant="selected" />}
    </>
  );
}
