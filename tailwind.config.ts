import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // CHIVI brand core
        maroon: "var(--chivi-maroon)",
        "maroon-deep": "var(--chivi-maroon-deep)",
        "maroon-brick": "var(--chivi-maroon-brick)",
        "maroon-ink": "var(--chivi-maroon-ink)",
        gold: "var(--chivi-gold)",
        amber: "var(--chivi-amber)",
        "amber-bright": "var(--chivi-amber-bright)",
        yellow: "var(--chivi-yellow)",
        sun: "var(--chivi-sun)",
        chilli: "var(--chivi-chilli)",
        cream: "var(--chivi-cream)",
        ink: "var(--chivi-ink)",
        charcoal: "var(--chivi-charcoal)",
        "chivi-black": "var(--chivi-black)",
        "off-white": "var(--chivi-off-white)",
        // Functional statuses (non-brand)
        "status-green": "#1B9C53",
        "status-green-deep": "#1B7A44",
        "status-green-bg": "#E7F6EC",
        "status-blue": "#2B5FB0",
        "status-blue-bg": "#E8F0FB",
        whatsapp: "#25D366",
        // App backgrounds
        "app-client": "#FBF3E4",
        "app-admin": "#F7F0E2",
        "app-cuisine": "#160A0A",
        "app-cuisine-deep": "#120707",
      },
      fontFamily: {
        display: ["Redgar", "Arial Black", "sans-serif"],
        mega: ["Cy Grotesk", "Arial Black", "sans-serif"],
        flash: ["Boldnova", "Cy Grotesk", "sans-serif"],
        product: ["Space Grotesk", "system-ui", "sans-serif"],
        condensed: ["Bebas Neue", "Space Grotesk", "sans-serif"],
        label: ["Montserrat", "Space Grotesk", "sans-serif"],
      },
      borderRadius: {
        card: "var(--radius-card)",
        capsule: "var(--radius-capsule)",
        burst: "var(--radius-burst)",
      },
      boxShadow: {
        hard: "var(--shadow-hard)",
        "hard-maroon": "var(--shadow-hard-maroon)",
        flash: "var(--shadow-flash)",
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
      },
      spacing: {
        poster: "var(--space-poster)",
      },
      backgroundImage: {
        "texture-red": "var(--texture-red)",
        "pattern-chivi": "var(--pattern-chivi)",
      },
    },
  },
  plugins: [],
};
export default config;
