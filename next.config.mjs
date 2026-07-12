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
  // Le binaire ffmpeg-static n'est pas détecté par le traçage automatique
  // des dépendances de Next — sans ceci, il manque dans le bundle Vercel et
  // la conversion audio échoue en prod (fonctionne pourtant en local). Sur
  // Next 14.2, cette clé est lue depuis `experimental`, pas depuis la racine.
  experimental: {
    outputFileTracingIncludes: {
      "/api/admin/whatsapp/send-media/**": ["./node_modules/ffmpeg-static/**"],
    },
  },
};

export default nextConfig;
