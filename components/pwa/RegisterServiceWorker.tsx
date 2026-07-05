"use client";

import { useEffect } from "react";

export function RegisterServiceWorker({ scope }: { scope: "client" | "cuisine" | "admin" }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`/${scope}/sw.js`, { scope: `/${scope}/` }).catch(() => {
      // Installation PWA non critique : on échoue silencieusement (ex. dev sans HTTPS).
    });
  }, [scope]);

  return null;
}
