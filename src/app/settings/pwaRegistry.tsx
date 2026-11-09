"use client";
import { useEffect } from "react";

// The one place the service worker is registered (push and the offline fallback share it).
export function PwaRegistry() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          // Not fatal: the app works without a worker, just without push or the offline page.
        });
    }
  }, []);

  return null;
}
