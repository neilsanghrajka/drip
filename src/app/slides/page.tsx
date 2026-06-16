"use client";

import { useEffect, useRef } from "react";

export default function SlidesPage() {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const focusDeck = () => frameRef.current?.contentWindow?.focus();
    focusDeck();
    window.addEventListener("focus", focusDeck);
    return () => window.removeEventListener("focus", focusDeck);
  }, []);

  return (
    <main className="h-svh w-full bg-white">
      <iframe
        className="h-full w-full border-0"
        onLoad={() => frameRef.current?.contentWindow?.focus()}
        ref={frameRef}
        src="/slides/deck"
        title="How Drip works — behind the scenes"
      />
    </main>
  );
}
