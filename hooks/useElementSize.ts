"use client";

import { useState, useEffect, useRef } from "react";

interface Size {
  width: number;
  height: number;
}

/**
 * Hook to measure element size using ResizeObserver
 * Returns the current width and height of the element
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>(): [
  React.RefObject<T | null>,
  Size
] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Initial measurement
    setSize({
      width: element.offsetWidth,
      height: element.offsetHeight,
    });

    // Use ResizeObserver for efficient updates
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setSize({ width, height });
      }
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return [ref, size];
}
