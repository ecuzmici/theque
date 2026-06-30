"use client";

import { useEffect } from "react";

/**
 * Registers the (auth-safe, minimal) service worker so thèque is installable and
 * has an offline fallback. Rendered once at the root so it controls the whole
 * origin. Failure is non-fatal — the app just runs without PWA features.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          /* non-fatal */
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
