/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lfbkhodlmphtmizobmzv.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    // ffmpeg-static calcule le chemin de son binaire via
    // path.join(__dirname, "ffmpeg") à l'exécution. Sans serverComponents-
    // ExternalPackages, webpack BUNDLE ce module dans le chunk de la route —
    // et réécrit alors __dirname pour pointer vers le dossier du chunk
    // compilé (ex: .next/server/app/api/.../send-media/) au lieu du vrai
    // dossier node_modules/ffmpeg-static, d'où le ENOENT en prod alors que
    // ça fonctionne en local (webpack ne bundle pas de la même façon en dev
    // Next garde ce module en require() natif, résolu par Node lui-même.
    serverComponentsExternalPackages: ["ffmpeg-static"],
    // Le binaire lui-même n'est pas détecté par le traçage automatique des
    // dépendances de Next — sans ceci, il manque du bundle Vercel déployé
    // (vérifié présent dans .next/.../route.js.nft.json après ce réglage).
    outputFileTracingIncludes: {
      "/api/admin/whatsapp/send-media/**": ["./node_modules/ffmpeg-static/**"],
    },
  },
};

export default nextConfig;
