"use client";
// Google AdSense slots. Every slot reserves its final size up front so nothing shifts when an ad
// loads. Until the owner sets an AdSense client ID (admin settings → `settings.ads.client`) and a
// slot ID for this placement (`settings.ads.slots[slot]`), the slot renders a labelled
// placeholder and no external script is requested.
import { createContext, useContext, useEffect, useRef } from "react";
import type { AdsSettings } from "../lib/plans";

export type AdFormat = "rail" | "banner" | "rectangle" | "in-feed";

const AdsContext = createContext<AdsSettings | undefined>(undefined);
export const AdsProvider = AdsContext.Provider;

const SCRIPT_ID = "adsbygoogle-js";
const CLIENT_ID = /^ca-pub-\d{10,20}$/;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

function loadScript(client: string) {
  if (document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src =
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
    encodeURIComponent(client);
  document.head.appendChild(s);
}

export function AdSlot({
  slot,
  format,
  className = "",
}: {
  // Placement name, e.g. "home-top", "catalog-feed", "product-side", "rail-left".
  slot: string;
  format: AdFormat;
  className?: string;
}) {
  const ads = useContext(AdsContext);
  const client = ads?.client && CLIENT_ID.test(ads.client) ? ads.client : "";
  const slotId = client ? ads?.slots?.[slot] : undefined;
  const live = !!(client && slotId);
  const pushed = useRef(false);
  useEffect(() => {
    if (!live || pushed.current) return;
    pushed.current = true;
    loadScript(client);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }, [live, client]);
  return (
    <aside
      className={`ad-slot ad-${format} ${live ? "ad-live" : "ad-empty"} ${className}`.trim()}
      aria-label="Reklam"
      data-ad-slot-name={slot}
    >
      <span className="ad-label">Reklam</span>
      {live ? (
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: "100%", height: "100%" }}
          data-ad-client={client}
          data-ad-slot={slotId}
          {...(format === "in-feed" || format === "banner"
            ? { "data-ad-format": "horizontal", "data-full-width-responsive": "true" }
            : format === "rectangle"
              ? { "data-ad-format": "rectangle" }
              : { "data-ad-format": "vertical" })}
        />
      ) : (
        <span className="ad-placeholder" aria-hidden="true">
          Reklam yeri
        </span>
      )}
    </aside>
  );
}
