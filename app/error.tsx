"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-maroon px-6 text-center">
      <div
        className="w-[200px] h-20 bg-center bg-contain bg-no-repeat"
        style={{ backgroundImage: "url('/brand_kit/assets/logo/chivi-wordmark-gold.png')" }}
      />
      <div className="font-display text-white text-lg uppercase tracking-wide max-w-xs">
        Un souci en cuisine 😅
      </div>
      <p className="text-cream/70 text-sm max-w-xs">
        Quelque chose s&apos;est mal passé. Réessaie — si ça persiste, préviens l&apos;équipe CHIVI.
      </p>
      <button onClick={reset} className="mt-2 px-6 py-3 rounded-full bg-amber text-maroon-deep font-bold">
        Réessayer
      </button>
    </div>
  );
}
