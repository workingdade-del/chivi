# CHIVI — Design System

**CHIVI** is a West African (Benin) street-food & beverage brand. Its identity is loud, appetite-first and hand-made: deep maroon fields, molten gold shouts, chilli-red accents, rough-cut display type and torn label edges. The campaign line is **« La cuillère ne ment jamais »** (*the spoon never lies*). Products seen in the source: **jus de bissap** (hibiscus juice, 250ml), **haricot** (beans with gari — au gésier, poisson ou à la viande), and grilled seafood. Ordering is via **WhatsApp** (`wa.me/c/22959398724`), pricing in **FCFA**.

The copy is French; treat French as the primary brand language.

## Sources

- **Figma file:** *"Codia AI Illustrator_ Adobe Illustrator_EPS to Editable Figma (Community).fig"* — a packaging/marketing artwork file (not a UI component library). It contained the CHIVI posters, packaging labels and the logotype PNG. Colours, type sizes and the tagline are transcribed verbatim from it.
- **Uploaded fonts:** `Redgar.ttf`, `Boldnova-Demo.otf`, `kobuzan-cy-grotesk-grand-dark.otf`.
- The file also carried several **unrelated designer template placeholders** (a bao hot-dog poster, a Mexican hot-sauce brand board, "Benny Steamz", "Snack Bulls"). These are **not CHIVI** and were discarded.

> Note: this is a graphics file. Figma's `METADATA.md` lists **0 component families, 0 token collections and 0 text styles** — there is no formal component/token inventory to import. The system below is therefore derived from the brand's *visual language*: its colours, type, logotype and the recurring packaging devices (torn label, price burst, ordering pill, NEW flash).

## Logo

CHIVI **has a real logotype** — a rough-cut italic slab wordmark, shipped as artwork in two colourways:
- `assets/logo/chivi-wordmark-gold.png` — gold, for maroon / dark fields
- `assets/logo/chivi-wordmark-alt.png` — maroon, for light / yellow fields

Always use the artwork. The `Wordmark` component falls back to Redgar type only when no `src` is passed.

---

## CONTENT FUNDAMENTALS

- **Language:** French first. Product names and copy are French (`Jus de Bissap`, `Haricot avec gari`, `À conserver au frais`, `Découvrez le menu`, `Scannez pour commander`).
- **Voice:** punchy, confident, appetite-driven street vendor — not corporate. Short declaratives and imperatives: *"La cuillère ne ment jamais."*, *"Scannez pour commander."*
- **Casing:** display and taglines are **ALL CAPS** (`LA CUILLÈRE NE MENT JAMAIS`, `HARICOT`, `NEW`). Product names set in Title/UPPER. Fine print in caps with wide tracking (`À CONSERVER AU FRAIS`).
- **Person:** speaks *to* the customer (imperative "vous" — *scannez*, *découvrez*, *commandez*), rarely about itself.
- **Numbers:** prices are bare numerals + `FCFA` (`1000 FCFA`, `À PARTIR DE … SANS LA LIVRAISON`). Volumes as `250ML`. Phone / WhatsApp handles shown literally (`0159398724`, `wa.me/c/22959398724`).
- **Emoji:** none. The brand never uses emoji. Iconography is minimal (see below).
- **Vibe:** hot, hand-made, generous, a little rowdy. Torn edges, tilted labels, big food photography. It should look printed and street-pasted, not sleek/digital.

## VISUAL FOUNDATIONS

- **Colour:** two-pole system. **Maroon** (`#7C0000`) grounds most surfaces; **gold/amber** (`#F6BC13`/`#FFB600`) shouts (logo, headlines). A saturated **sun yellow** field (`#FBC400`) is the alternate key-art background (the shrimp poster). **Chilli red** (`#E73223`) and **cream** (`#FFE8A6`) accent. Near-black (`#0A0000`) only for torn labels. High contrast, no pastels, no muddy midtones.
- **Type:** four voices — **Redgar** (rough slab display: logotype + tagline), **Cy Grotesk Grand Dark** (ultra-heavy grotesque: mega lockups like *bissap*, and FCFA price numerals), **Boldnova** (chunky rounded: the *NEW* flash), **Space Grotesk** (product names, body, UI). **Bebas Neue** condensed for volumes; **Montserrat** for fine print (Gilroy substitute — see caveats). Display always sets solid (line-height 100%) — copied from source.
- **Backgrounds:** flat brand-colour fields, sometimes overlaid with a **red woven texture** or a faint **repeating-CHIVI word pattern**. Big full-bleed **food photography** on key art (warm, saturated, glossy, shot on plain brand-colour or black seamless).
- **Depth:** almost **no soft UI shadow**. Depth comes from **hard offset drop shadows** (e.g. `5px 5px 0` black) behind display type, and **torn / rough clip-path edges** on labels. Product tiles in the UI kit may use one soft lift (`--shadow-card`) sparingly.
- **Shape & radius:** capsule pill for the CTA (`~30px`), rounded product tiles (`24px`), and **organic blob** price bursts (large radius, offset twin). Labels are irregular hand-cut polygons, not clean rectangles.
- **Motion:** minimal and physical. Press states **shrink** (`scale 0.97`); hovers **brighten/darken** slightly. No easing showmanship, no bounce, no parallax. Labels sit at slight static rotations (±1–8°) for a pasted-on feel — not animated.
- **Layout:** poster-grid thinking. 50px frame margins (`--space-poster`), generous gutters. Elements overlap and tilt; the logo anchors a top corner; the CTA/price anchors bottom.
- **Transparency & blur:** rarely used. Texture overlays use `multiply` at low opacity; no glassmorphism.

## ICONOGRAPHY

CHIVI is **near-iconless**. It communicates with **type, photography and torn labels**, not an icon set. The only glyph-like assets in the source are:
- **QR codes** (`assets/photos/qr-code.jpg`, `qr-food.jpg`) — for *"Scannez pour commander"*.
- **No icon font, no SVG icon library, no emoji, no unicode icons.**

If a UI surface genuinely needs functional icons (e.g. a menu/app kit), use a **thin, rounded line set** to match the friendly display type — **Lucide** (CDN) is the recommended substitute, kept sparse. Flag any such use as an addition, since the brand itself defines none.

---

## Components

Reusable primitives, grounded in the packaging devices the source actually uses. Namespace: `window.CHIVIDesignSystem_f1f588`.

- **Wordmark** (`components/brand/`) — the CHIVI logotype (real artwork via `src`, or Redgar type fallback).
- **TornLabel** (`components/brand/`) — hand-cut black label carrying gold Redgar caps (the tagline device).
- **NewBadge** (`components/brand/`) — chilli-red *NEW* / promo ribbon flash in Boldnova.
- **PriceBurst** (`components/commerce/`) — organic yellow price blob with maroon offset, FCFA pricing.
- **CtaPill** (`components/commerce/`) — white WhatsApp ordering pill.
- **VolumeTag** (`components/commerce/`) — Bebas condensed caps for pack sizes (`250ML`).
- **PosterField** (`components/layout/`) — the brand background field (maroon / sun / dark, optional texture).

### Intentional additions
- **PosterField** — not a discrete Figma component, but every poster in the source sits on the same maroon/sun field; extracted as a layout primitive so comms compose consistently.
- **Lucide icons** (UI kit only) — the brand defines no icons; a thin line set is substituted where a functional UI needs them.

## UI kits

- **`ui_kits/comms/`** — CHIVI's real product: marketing **posters** and product **labels** (jus de bissap label, haricot promo poster, shrimp key art). An interactive index cycles the poster set.

## Slides

- **`slides/`** — a branded 16:9 deck template (title, statement, product, price/CTA) using the foundations and logo.

## Foundations (Design System tab cards)

`foundations/` holds specimen cards — colours (maroon / gold / accents), type (Redgar / Cy Grotesk / Boldnova+Bebas / Space Grotesk), spacing & radii, and brand (logo / textures / depth).

## Root manifest

```
styles.css                 → global entry (imports only)
tokens/                    → colors, typography, fonts, spacing, effects
assets/logo/               → CHIVI wordmark (gold + maroon)
assets/photos/             → food key art (shrimp, haricot) + QR codes
assets/textures/           → red weave, repeating-CHIVI pattern
assets/fonts/              → Redgar, Cy Grotesk, Boldnova
components/{brand,commerce,layout}/
foundations/               → specimen cards
ui_kits/comms/             → posters & labels
slides/                    → deck template
SKILL.md                   → Agent-Skills entry point
```

## Caveats / substitutions

- **Gilroy-Bold** (used for fine print in the source) is **not provided** → substituted with **Montserrat**. Supply the Gilroy files to restore exactly.
- **Space Grotesk** (product & UI voice) is bundled locally. **Bebas Neue, Montserrat** load from Google Fonts.
- No formal component/token/text-style inventory existed in the file (it's artwork); the system is derived from the brand's visual language.
