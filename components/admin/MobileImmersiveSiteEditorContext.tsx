"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type MobileImmersiveSiteEditorContextValue = {
  immersiveMobileSiteEditor: boolean;
  setImmersiveMobileSiteEditor: (value: boolean) => void;
};

const MobileImmersiveSiteEditorContext =
  createContext<MobileImmersiveSiteEditorContextValue | null>(null);

export function MobileImmersiveSiteEditorProvider({ children }: { children: ReactNode }) {
  const [immersiveMobileSiteEditor, setImmersiveMobileSiteEditorState] = useState(false);
  const setImmersiveMobileSiteEditor = useCallback((value: boolean) => {
    setImmersiveMobileSiteEditorState(value);
  }, []);

  const value = useMemo(
    () => ({ immersiveMobileSiteEditor, setImmersiveMobileSiteEditor }),
    [immersiveMobileSiteEditor, setImmersiveMobileSiteEditor]
  );

  return (
    <MobileImmersiveSiteEditorContext.Provider value={value}>
      {children}
    </MobileImmersiveSiteEditorContext.Provider>
  );
}

export function useMobileImmersiveSiteEditor() {
  const ctx = useContext(MobileImmersiveSiteEditorContext);
  if (!ctx) {
    throw new Error("useMobileImmersiveSiteEditor must be used within MobileImmersiveSiteEditorProvider");
  }
  return ctx;
}
