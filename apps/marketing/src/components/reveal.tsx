"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * The page's one motion primitive: a section fades and lifts a few pixels
 * into place the first time it enters the viewport, then leaves it alone —
 * it never re-triggers on scroll-back. `prefers-reduced-motion` is handled
 * in CSS (`.reveal` renders fully visible with no transition), so this
 * component's only job is adding `.in` once, which is a no-op either way.
 */
export function Reveal({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const Component = Tag;
  return (
    <Component ref={ref} className={`reveal ${visible ? "in" : ""} ${className}`}>
      {children}
    </Component>
  );
}
