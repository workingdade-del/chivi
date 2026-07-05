# Handoff : les 3 PWA CHIVI (Client · Cuisine · Admin)

## Overview
CHIVI est une dark kitchen (restaurant en ligne) à Cotonou, Bénin. L'écosystème comporte **trois Progressive Web Apps** distinctes, toutes livrées ici comme maquettes de référence :

1. **PWA Client** — commande côté client (mobile first) : splash, menu, fiche produit, panier, localisation WhatsApp, paiement, confirmation + suivi, historique.
2. **PWA Cuisine** — écran de production en cuisine (tablette, mode sombre haut-contraste) : tableau de tickets, avancement de statut, détail commande.
3. **PWA Admin** — console de gestion (desktop) : dashboard, commandes + détail, livreurs, gestion du menu, rapport financier, clients + fiche client.

Langue : **français**. Devise : **FCFA** (jamais €/$). Commande/confirmation via **WhatsApp**.

## Contenu du bundle
```
design_handoff_chivi_pwas/
├── README.md                 ← ce document (spec des 3 PWA)
├── brand_kit/                ← LE DESIGN SYSTEM RÉEL — à intégrer tel quel
│   ├── styles.css            ← point d'entrée : @import de tous les tokens
│   ├── BRAND.md              ← charte de marque complète (voix, couleurs, type, do/don't)
│   ├── tokens/               ← colors · typography · fonts · spacing · effects (.css)
│   └── assets/
│       ├── fonts/            ← Redgar, Cy Grotesk, Boldnova, Space Grotesk (fichiers réels)
│       ├── logo/             ← wordmark or + wordmark maroon + mark small
│       ├── photos/           ← 2 vraies photos plat (haricot, crevettes) + 2 QR
│       └── textures/         ← texture rouge + pattern CHIVI
└── AppFiles/                 ← les 3 maquettes de référence (.dc.html)
```

## About the Design Files
Deux natures de fichiers, à traiter différemment :

- **`brand_kit/`** = le **design system réel**, à **intégrer tel quel** dans le projet. Vraies polices, vrais logos, vraies photos, tous les tokens CSS. `brand_kit/styles.css` importe l'ensemble ; les chemins relatifs (`tokens/` → `assets/`) sont déjà corrects, il suffit de copier le dossier dans le projet et de linker `styles.css`.
- **`AppFiles/*.dc.html`** = des **références visuelles** (prototypes HTML montrant look + comportement), **pas du code de production à copier ligne à ligne**. Elles sont dans un format interne.

La tâche : **implémenter les 3 PWA dans l'environnement cible** en réutilisant le `brand_kit/` pour tout le style (couleurs, polices, tokens) et en suivant la spec écran-par-écran ci-dessous pour le layout et le comportement. Si aucun codebase n'existe encore, choisissez la stack adaptée et implémentez proprement.

**Stack recommandée** (à ajuster librement) : React + Vite + TypeScript, PWA (manifest + service worker, offline-first), state local léger (Zustand/Context). Icônes : **Lucide** (déjà l'esprit des SVG inline des maquettes). Cuisine et Admin sont responsive mais optimisées respectivement tablette et desktop.

### Démarrage rapide
1. Copiez `brand_kit/` à la racine du projet (ou dans `src/brand/`).
2. Importez le point d'entrée : `import './brand_kit/styles.css'` (ou `<link rel="stylesheet" href="/brand_kit/styles.css">`). Ça charge les `@font-face` locaux + tous les tokens CSS custom properties.
3. Utilisez les variables partout : `background: var(--chivi-maroon)`, `font-family: var(--font-mega)`, `border-radius: var(--radius-card)`, etc. **Ne recodez pas les couleurs/polices en dur** — tout est déjà tokenisé.
4. Les logos/photos sont dans `brand_kit/assets/` — référencez-les depuis là (ou déplacez-les dans le dossier public de la stack).
5. Lisez `brand_kit/BRAND.md` pour la voix, le casing (CAPS pour display), et les règles (pas d'emoji, prix `1 000 FCFA`, etc.).

## Fidelity
**Haute fidélité (hifi).** Couleurs, typographies, espacements et interactions sont définitifs et natifs au design system CHIVI. Recreez l'UI au pixel près en utilisant les tokens fournis (`tokens/`). Les photos de plats et la carte de localisation sont des **placeholders rayés** volontaires (motif `repeating-linear-gradient` + légende monospace) — à remplacer par les vraies photos / une vraie carte lors de l'implémentation.

---

## Design System — rappel

### Couleurs (hex exacts)
Fond/ancrage maroon, cris en or/ambre, accents chilli. Voir `brand_kit/tokens/colors.css`.

- `--chivi-maroon` **#7C0000** — fond primaire (barres d'app, sidebar, splash)
- `--chivi-maroon-deep` **#780003** — chiffres de prix, numéros de commande
- `--chivi-gold` **#F6BC13** — logotype, titres sur maroon
- `--chivi-amber` **#FFB600** — CTA secondaires, badges, statut « Nouvelle »
- `--chivi-chilli` **#E73223** — accents, statut « En préparation », badges panier/NEW
- `--chivi-cream` **#FFE8A6** — sous-copie sur maroon
- `--chivi-ink` **#1D1D1B** — texte principal sur clair
- Statuts fonctionnels (non-brand, utilisés dans l'UI) : vert `#1B9C53` / `#1B7A44` (livré, prêt, bénéfice), fond succès `#E7F6EC` ; bleu route `#2B5FB0` / fond `#E8F0FB` ; WhatsApp `#25D366`.
- Fonds d'app : Client `#FBF3E4` (crème), Admin `#F7F0E2` (crème), Cuisine `#160A0A` / `#120707` (sombre).

### Typographie
- **Redgar** (`--font-display`) — titres d'écran en CAPS (barres, en-têtes). Fallback `"Arial Black"`.
- **Cy Grotesk Grand Dark** (`--font-mega`) — chiffres : prix FCFA, quantités, numéros de commande, KPIs, compteurs. Fallback `"Arial Black"`.
- **Space Grotesk** (`--font-product`) — corps, noms de plats, boutons, toute l'UI. Fallback `system-ui`.
- **Boldnova** (`--font-flash`) — badge « NEW » uniquement.
- Détails complets et échelle : `brand_kit/tokens/typography.css`.

### Rayon, ombre, profondeur
- Rayons : cartes/tuiles 16–22px, pilules/CTA 13–18px, badges/chips 999px (capsule), avatars 50%.
- Ombres : très douces et rares (`0 14px 30px -20px rgba(10,0,0,.5)` sur les cartes). Le CTA maroon utilise l'ombre dure du brand `--shadow-hard-maroon`.
- Motion : discrète et physique. Press = léger `scale`. Pas de bounce/parallax. Splash : spinner + `scale` d'entrée du logo (voir keyframes dans le fichier Client).

### Assets
- `brand_kit/assets/logo/chivi-wordmark-gold.png` — logotype or, pour fonds maroon/sombres (utilisé dans les 3 apps). `chivi-wordmark-alt.png` = version maroon pour fonds clairs.
- Photos de plats & carte : **placeholders** dans les maquettes ; 2 vraies photos fournies dans `brand_kit/assets/photos/` — fournir le reste.
- Icônes : SVG inline (stroke) dans les maquettes ; remplacer par **Lucide** équivalents.

---

## PWA 1 — CLIENT (mobile, priorité haute)
Fichier : `AppFiles/ClientApp.dc.html`. Cadre : téléphone 430px de large, fond crème `#FBF3E4`, encoche en haut. Navigation basse fixe (Menu · Panier · Commandes) visible sur les écrans principaux.

### Écrans
1. **Splash** — fond maroon plein, logotype or animé (entrée `scale`), tagline « La cuillère ne ment jamais » en Redgar or, spinner. Auto-transition vers Menu après ~1,5 s.
2. **Menu** — en-tête maroon collant (logo + pastille « Cotonou », message d'accueil « Bonsoir 👋 on mange quoi ? »), rangée de **catégories filtrables** en chips (Plats CHIVI, Plats Traditionnels, Boissons) ; chip actif = fond ambre, inactif = translucide. Liste de cartes plat : photo placeholder (hauteur selon densité), badge NEW optionnel (chilli, tourné -4°), nom, description, « À partir de » + prix Cy Grotesk, bouton `+` ambre. Toute la carte ouvre la fiche.
3. **Fiche produit** — grande photo placeholder + bouton retour rond ; nom, prix, description ; **sélecteur de variante/protéine** (ex. Gésier / Poisson / Viande — seulement si le plat en a) ; **sélecteur de taille** (Normal / Grand +500) ; **suppléments** multi-sélection (Frites, Alloco, Akassa) avec checkbox maroon ; **quantité** (− / +). CTA collant bas « Ajouter au panier » avec total live. Sélection = bordure/fond maroon, gold sur maroon.
4. **Panier** — en-tête maroon avec retour ; lignes (vignette, nom, détail des options, stepper −/+, total ligne) ; encart récap : sous-total, frais de livraison (500 FCFA), total. CTA « Commander → ». État vide géré.
5. **Localisation** — en-tête « Où livrer ? » ; carte placeholder avec épingle chilli ; bouton ambre « Partager ma position GPS » ; textarea d'indication (repère/immeuble) ; encart WhatsApp vert expliquant la confirmation ; CTA « Continuer vers le paiement ».
6. **Paiement** — 3 options radio en cartes : **Cash à la livraison**, **Mobile Money à la livraison**, **Paiement en avance (MoMo)**. Option sélectionnée = bordure maroon + fond `#FFF6E5` + puce pleine. Récap « Total à payer ». CTA vert « Confirmer sur WhatsApp ».
7. **Confirmation** — bandeau maroon avec coche ambre « Commande reçue ! » + numéro (#CHV-2048) ; **timeline de statut** verticale 4 étapes : Reçue → En préparation → En route → Livrée (étape atteinte = pastille ambre, future = grise) ; récap des lignes + total ; bouton démo « Simuler l'étape suivante » + « Nouvelle commande ».
8. **Historique** — liste de commandes passées : numéro, date, nb articles, badge statut (Livrée vert / Annulée rouge), total, lien « Recommander ↻ ».

### Navigation & état (Client)
- `screen` : splash | menu | product | cart | location | payment | confirm | history.
- Splash → menu via timeout 1500ms.
- `category` (filtre menu), `selectedId` (plat ouvert), `variant`, `size`, `supps[]`, `qty` (fiche produit).
- `cart[]` : lignes `{name, detail, unit, qty}`. Prix unitaire = base + (Grand ? +500) + Σ suppléments. Total panier + livraison 500.
- `payment` (option choisie), `statusStep` (0–3, timeline confirmation).
- Onglet actif de la nav basse dérivé de l'écran (cart/location/payment/confirm → onglet Panier).
- **Tweaks exposés** : message d'accueil (on/off), densité des cartes menu (Confortable/Compact), badges NEW (on/off).

### Données de démo (menu)
9 items sur 3 catégories, prix base en FCFA : Poulet CHIVI braisé 2500 (NEW), Riz CHIVI complet 2000, Poisson braisé CHIVI 3000, Haricot au gari 1000 (variantes), Akassa poisson 1500, Amiwo poulet 2000, Jus de Bissap 250ml 500, Jus de Gingembre 250ml 500, Eau minérale 300. Suppléments : Frites 500, Alloco 500, Akassa 300. Livraison : 500.

---

## PWA 2 — CUISINE (tablette, mode sombre, priorité haute)
Fichier : `AppFiles/CuisineApp.dc.html`. Cadre tablette ~1180×800, fond sombre `#160A0A`, pensé pour lecture rapide en cuisine : **gros texte, gros boutons, fort contraste**.

### Écrans / zones
1. **Barre supérieure** — logo or + « Cuisine · Production » (Redgar) + lieu ; **3 compteurs** live : En attente (ambre, pastille pulsée), En prépa (chilli), Prêtes (vert) ; horloge + date.
2. **Tableau de tickets** — grille responsive de cartes (min 340px). Chaque ticket : liseré de couleur en haut selon statut, numéro (#CHV-XXXX) en Cy Grotesk gold, heure de réception, badge de statut, temps écoulé (rouge si ≥10 min et pas prêt), liste des articles (`qté ×`, nom, options en clair), encart **note client** si présente, et **un gros bouton d'action** qui fait avancer le statut :
   - Nouvelle → bouton ambre « Commencer la préparation »
   - En préparation → bouton chilli « Marquer prêt »
   - Prête → bouton vert « Remis au livreur » (retire le ticket)
3. **Détail commande (modal)** — clic sur un ticket : overlay sombre, numéro géant, badge statut, bouton fermer, liste articles détaillée (options + note par ligne), note client, bouton d'avancement pleine largeur.
4. **État vide** — « Tout est servi » quand aucun ticket.

### Navigation & état (Cuisine)
- `tickets[]` : `{id, number, time, mins, status, items[{qty,name,opts,note?}], note}`. Statuts : `nouvelle → prepa → prete → (retiré)`.
- `openId` : ticket ouvert dans le modal.
- Tri : par priorité de statut puis par urgence (temps d'attente).
- Avancer un ticket : bouton carte ou modal → statut suivant ; « Remis au livreur » filtre le ticket hors liste.
- **Tweaks exposés** : trier par urgence (on/off), afficher notes client (on/off).

---

## PWA 3 — ADMIN (desktop, priorité moyenne)
Fichier : `AppFiles/AdminApp.dc.html`. Cadre desktop ~1320×868, fond crème `#F7F0E2`. **Sidebar maroon fixe** (236px) + zone principale avec en-tête (titre d'écran Redgar + sous-titre, recherche, statut « Service ouvert »).

### Sidebar
Logo or, puis 6 entrées avec icônes : Dashboard, Commandes (badge du nombre en attente), Livreurs, Gestion menu, Rapports, Clients. Entrée active = fond ambre/texte maroon ; inactive = texte crème. Bloc profil gérante en bas.

### Écrans
1. **Dashboard** — 4 cartes KPI (Commandes 47, Revenus 168 500 FCFA, Coûts 96 200, Bénéfice 72 300 marge 43%) avec icône teintée et delta ; **graphe barres** revenus 7 derniers jours (dernier jour en ambre plein, autres en or atténué) ; panneau « Commandes en cours » (barres Reçues/En prépa/En route) + « Top plats du jour ».
2. **Commandes** — chips de filtre (Toutes / Reçues / En préparation / En route) ; **table** : Commande (numéro Cy Grotesk), Client + heure, Statut (badge coloré : Reçue ambre, En préparation rouge, En route bleu, Livrée vert), Montant, Livreur (nom ou « À assigner » en chilli), chevron. Ligne cliquable → détail.
3. **Détail commande** — retour ; colonne gauche : numéro géant, statut, articles (`qté ×`, nom, options, prix), note client, sous-total/livraison/total ; colonne droite : **timeline de suivi** (Reçue/En préparation/En route/Livrée) + carte **livreur assigné** (avatar+tél, ou bouton « Assigner un livreur » si aucun).
4. **Livreurs** — grille de cartes : avatar initiale, nom, téléphone, badge Libre (vert) / En course (rouge) ; si en course → commande + destination ; si libre → nb de courses du jour.
5. **Gestion menu** — table : plat (vignette + nom, barré si désactivé), catégorie, prix, **toggle de disponibilité** (vert actif / gris inactif). Toggle modifie l'état.
6. **Rapport financier** — bascule période (Aujourd'hui / Cette semaine / Ce mois) ; 3 cartes (Revenus sur fond maroon+or, Coûts, Bénéfice net + marge) ; **table détaillée** par tranche/jour/semaine : lignes, revenus, coûts, bénéfice. Les chiffres changent selon la période.
7. **Clients** — table : client (avatar+nom), WhatsApp, nb commandes, total dépensé, chevron. Ligne → fiche.
8. **Fiche client** — colonne gauche : avatar, nom, badge « Profil auto-créé via WhatsApp », coordonnées (WhatsApp, zone, client depuis), 2 stats (commandes, dépensé) ; colonne droite : **historique des commandes** (numéro, date, nb articles, total, badge Livrée).

### Navigation & état (Admin)
- `screen` : dashboard | orders | orderDetail | drivers | menu | reports | clients | clientDetail.
- Groupe de nav actif : orders/orderDetail → « Commandes » ; clients/clientDetail → « Clients ».
- `orderFilter` (filtre table commandes), `orderId` (détail), `clientId` (fiche), `reportPeriod` (jour/semaine/mois), `menuOff[]` (plats désactivés).
- **Tweaks exposés** : badge des commandes en attente dans la sidebar (on/off).

---

## Interactions & comportement (transverse)
- **Navigation** : entièrement cliquable dans les maquettes (changement de `screen`/état, pas de vraies routes). En prod : router + états de chargement/erreur à ajouter (fetch commandes, MoMo, etc.).
- **Statuts de commande** : cycle unique partagé Reçue → En préparation → En route/Prête → Livrée. Cuisine pilote En préparation/Prête ; Admin assigne le livreur et suit En route/Livrée ; Client voit le miroir en lecture.
- **WhatsApp** : la confirmation client et la création de fiche client passent par WhatsApp — prévoir l'intégration (lien `wa.me` / API) à l'implémentation.
- **Localisation** : bouton GPS = `navigator.geolocation` réel ; carte placeholder = à remplacer (Leaflet/Google Maps).
- **Format prix** : `n.toLocaleString('fr-FR')` + « FCFA », séparateur milliers espace (ex. `1 000 FCFA`). Jamais de décimales, jamais de symbole monétaire.
- **Responsive** : Client mobile-first ; Cuisine ≥ tablette (grille auto-fill) ; Admin ≥ desktop (sidebar + grilles). En prod, prévoir le repli mobile de l'Admin.

## Design Tokens
**Intégralité fournie et prête à l'emploi** dans `brand_kit/` — importez `brand_kit/styles.css`, n'écrivez aucune valeur en dur :
- `tokens/colors.css` — palette complète + alias sémantiques.
- `tokens/typography.css` — familles (`--font-display/mega/flash/product`), poids, échelle, tracking.
- `tokens/fonts.css` — `@font-face` des 4 polices locales + fallbacks Google (Bebas, Montserrat).
- `tokens/spacing.css` — échelle d'espacement + rayons (`--radius-card` 24px, `--radius-capsule` 30px…).
- `tokens/effects.css` — ombres dures/douces, clip-paths torn label, textures.

## Assets (réels, inclus)
- `brand_kit/assets/fonts/` — **Redgar, Cy Grotesk Grand Dark, Boldnova, Space Grotesk** (fichiers réels). *Gilroy non fourni → Montserrat en substitut, cf BRAND.md.*
- `brand_kit/assets/logo/` — wordmark **or** (fonds maroon/sombres), wordmark **maroon** (fonds clairs/jaunes), mark small. Les 3 apps utilisent l'or.
- `brand_kit/assets/photos/` — 2 vraies photos plat (haricot, crevettes) + 2 QR. À compléter par les photos du reste du menu.
- `brand_kit/assets/textures/` — texture rouge + pattern CHIVI.

## Files (dans ce bundle)
- `brand_kit/` — **design system réel à intégrer** (styles.css + tokens + assets + BRAND.md).
- `AppFiles/ClientApp.dc.html` — PWA Client (référence).
- `AppFiles/CuisineApp.dc.html` — PWA Cuisine (référence).
- `AppFiles/AdminApp.dc.html` — PWA Admin (référence).

> Les `.dc.html` sont des **références visuelles**, pas la cible de build. Intégrez `brand_kit/` tel quel, puis implémentez le comportement décrit dans l'environnement retenu (React/PWA recommandé).
