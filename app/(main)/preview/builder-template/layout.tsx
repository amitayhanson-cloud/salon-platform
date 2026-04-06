import type { Viewport } from "next";

/** Iframe document must use device-width so templates match real mobile breakpoints. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function BuilderTemplatePreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-0 min-w-0 bg-black [-webkit-tap-highlight-color:transparent]">
      {children}
    </div>
  );
}
