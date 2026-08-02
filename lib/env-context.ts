import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Un seul numéro Meta App reçoit les webhooks pour 2 numéros WhatsApp
 * différents (production + test), chacun avec son propre projet Supabase.
 * Plutôt que de faire porter l'environnement (prod/test) en paramètre à
 * travers chaque fonction de lib/supabase/server.ts et lib/whatsapp.ts (un
 * changement de signature massif, risqué à faire sans pouvoir tout
 * retester), on le propage via AsyncLocalStorage : le webhook route
 * détermine l'environnement une fois par message reçu (metadata.phone_number_id)
 * et l'attache à toute la chaîne d'appels asynchrones qui en découle —
 * createServiceClient() et les fonctions d'envoi WhatsApp (lib/whatsapp.ts)
 * lisent ce contexte ambiant au lieu de process.env directement.
 *
 * Hors d'un webhook (routes Admin, cron, etc.), aucun contexte n'est
 * présent : getCurrentEnvContext() retombe alors sur PROD par défaut —
 * c'est le comportement sûr, puisque l'Admin ne doit jamais opérer sur le
 * projet de test.
 */
export type ChiviEnv = "prod" | "test";

export interface EnvContext {
  env: ChiviEnv;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  whatsappToken: string;
  whatsappPhoneNumberId: string;
}

/** Doivent correspondre à WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TEST_PHONE_NUMBER_ID en environnement — dupliqués ici en constantes explicites pour que la détection ne dépende pas d'une variable d'env qui pourrait être mal configurée. */
const PROD_PHONE_NUMBER_ID = "1182888408240788";
const TEST_PHONE_NUMBER_ID = "1312864531902990";

const storage = new AsyncLocalStorage<EnvContext>();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

function prodContext(): EnvContext {
  return {
    env: "prod",
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    whatsappToken: requireEnv("WHATSAPP_TOKEN"),
    whatsappPhoneNumberId: requireEnv("WHATSAPP_PHONE_NUMBER_ID"),
  };
}

function testContext(): EnvContext {
  return {
    env: "test",
    supabaseUrl: requireEnv("SUPABASE_TEST_URL"),
    supabaseAnonKey: requireEnv("SUPABASE_TEST_ANON_KEY"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_TEST_SERVICE_ROLE_KEY"),
    // Le token peut être partagé avec la prod si le System User couvre toute
    // l'app Meta (précisé par l'utilisateur) — WHATSAPP_TEST_TOKEN reste
    // prioritaire s'il est renseigné séparément.
    whatsappToken: process.env.WHATSAPP_TEST_TOKEN || requireEnv("WHATSAPP_TOKEN"),
    whatsappPhoneNumberId: requireEnv("WHATSAPP_TEST_PHONE_NUMBER_ID"),
  };
}

/**
 * Détermine l'environnement à partir du phone_number_id reçu dans
 * value.metadata du payload webhook Meta. Fail-safe explicite : un
 * phone_number_id absent ou non reconnu retombe sur PROD (ne jamais
 * deviner silencieusement "test" sur une donnée ambiguë) ; un
 * phone_number_id de test dont les variables d'env ne sont pas encore
 * configurées lève une erreur claire plutôt que d'écrire par erreur dans
 * le mauvais projet Supabase.
 */
export function resolveEnvContextForPhoneNumberId(phoneNumberId: string | undefined): EnvContext {
  if (phoneNumberId === TEST_PHONE_NUMBER_ID) {
    return testContext();
  }
  if (phoneNumberId && phoneNumberId !== PROD_PHONE_NUMBER_ID) {
    console.warn("[env-context] phone_number_id inconnu, fallback PROD par sécurité", { phoneNumberId });
  }
  return prodContext();
}

export function runWithEnvContext<T>(context: EnvContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

/** Contexte ambiant courant. En dehors d'un webhook (Admin, cron…), retombe sur PROD — jamais sur test par défaut. */
export function getCurrentEnvContext(): EnvContext {
  return storage.getStore() ?? prodContext();
}

export function envTag(): string {
  return getCurrentEnvContext().env === "test" ? "[TEST]" : "[PROD]";
}
