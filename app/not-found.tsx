import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-maroon px-6 text-center">
      <div
        className="w-[200px] h-20 bg-center bg-contain bg-no-repeat"
        style={{ backgroundImage: "url('/brand_kit/assets/logo/chivi-wordmark-gold.png')" }}
      />
      <div className="font-mega text-6xl text-gold leading-none">404</div>
      <div className="font-display text-white text-lg uppercase tracking-wide max-w-xs">
        Cette page n&apos;est pas au menu
      </div>
      <p className="text-cream/70 text-sm max-w-xs">
        La cuillère ne ment jamais, mais ce lien, si. Retourne vers une page qui existe.
      </p>
      <Link href="/client/menu" className="mt-2 px-6 py-3 rounded-full bg-amber text-maroon-deep font-bold">
        Retour au menu
      </Link>
    </div>
  );
}
