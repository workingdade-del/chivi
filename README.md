# CHIVI

Dark kitchen à Cotonou, Bénin — 3 PWA dans un monorepo Next.js 14 (App Router) + Supabase + WhatsApp Cloud API.

- `/client` — commande (mobile, priorité business)
- `/cuisine` — tickets de production temps réel (tablette, staff)
- `/admin` — console de gestion (desktop, staff)

## Stack

Next.js 14 · Tailwind CSS · Supabase (Postgres + Auth + Realtime + Storage) · WhatsApp Cloud API · Vercel.

## Démarrer en local

```bash
npm install
npm run dev
```

`.env.local` contient déjà les clés Supabase et WhatsApp (jamais commité, voir `.gitignore`).

## Base de données

Le schéma complet vit dans `supabase/migrations/` (à appliquer dans l'ordre, une seule fois) :

- `0001_init.sql` — tables + RLS
- `0002_seed_menu.sql` — menu, suppléments, zones de livraison
- `0003_order_status_prete.sql` — statut "prête" (cuisine → livreur)
- `0004_realtime_orders.sql` — active Realtime sur `orders`

À exécuter via le SQL Editor du dashboard Supabase, ou `psql <connection-string> -f supabase/migrations/000X_*.sql`.

### RLS — modèle de sécurité

- **Menu** (products/variants/supplements/delivery_zones) : lecture publique (clé anon), pour la PWA Client.
- **Tout le reste** (profils, commandes, livreurs, finances, logs WhatsApp) : aucun accès anon. Les écritures client passent par les routes `/api/*` (service role, jamais exposée au navigateur) ; Cuisine et Admin lisent/écrivent via un compte Supabase Auth "staff" (n'importe quel compte authentifié = staff, pas de rôles fins pour l'instant).

### Comptes staff

```bash
node scripts/create-staff-user.mjs <email> <mot-de-passe>
```

Crée ou met à jour un compte de connexion pour `/cuisine/login` et `/admin/login` (les deux partagent la même auth).

## WhatsApp

- Sortant : confirmation de commande envoyée automatiquement après création (`lib/whatsapp.ts`, appelé par `POST /api/orders`).
- Entrant : webhook `/api/whatsapp/webhook` — vérifie le handshake Meta (`hub.challenge`) et auto-crée le profil client + log chaque message dans `whatsapp_messages`.
- **À faire une fois déployé** : dans Meta App Dashboard → WhatsApp → Configuration, enregistrer `https://<ton-domaine>/api/whatsapp/webhook` avec le verify token `WHATSAPP_VERIFY_TOKEN` (défini dans `.env.local`). Le numéro business (`22959398724`) doit aussi passer en mode production pour envoyer des messages à des numéros non enregistrés en test.

## Photos du menu

Seule `Haricot gras + Gésier & Gari` a une vraie photo (`brand_kit/assets/photos/dish-haricot.jpg`). Les 14 autres plats attendent leurs fichiers dans le bucket Supabase Storage `menu-images`, sous les noms déjà référencés en base (`Spaghetti.jpg`, `Atcheke.jpg`, etc. — voir `image_path` dans `products`). Tant qu'une photo n'est pas uploadée, l'UI affiche le placeholder rayé prévu par le design.

## Design system

`public/brand_kit/` est le design system fourni tel quel (polices, logos, tokens CSS). `tailwind.config.ts` mappe les tokens (`--chivi-maroon`, `--font-display`, etc.) en classes Tailwind (`bg-maroon`, `font-display`...). Ne pas coder de couleurs/polices en dur — tout est déjà tokenisé.

## PWA

Chaque app a son propre `manifest.webmanifest` + service worker scopé (`public/{client,cuisine,admin}/{manifest.webmanifest,sw.js,offline.html}`), installables indépendamment.
