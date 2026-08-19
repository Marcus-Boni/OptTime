"use client";

import { useEffect, useState } from "react";

/**
 * Label for the primary shortcut modifier: "⌘" on Apple platforms, "Ctrl"
 * everywhere else. Resolved after mount so the server and the first client
 * render always agree.
 */
export function useModifierKey(): string {
  const [modifier, setModifier] = useState("Ctrl");

  useEffect(() => {
    if (/mac|iphone|ipad/i.test(navigator.userAgent)) {
      setModifier("⌘");
    }
  }, []);

  return modifier;
}
