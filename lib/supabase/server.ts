import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";
import { getCurrentEnvContext } from "@/lib/env-context";

/**
 * Next.js patches the global `fetch` and caches responses by default in
 * Server Components / Route Handlers — including third-party calls made
 * internally by supabase-js. Without this override, every server-side
 * Supabase read gets silently frozen at whatever it first returned, no
 * matter how the row changes afterwards (this was the root cause behind
 * "actions don't update the UI without a manual refresh").
 */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: noStoreFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore when
            // middleware refreshes the session instead.
          }
        },
      },
    }
  );
}

/**
 * Service-role client for trusted server contexts only (webhooks, cron).
 * Never expose to the client. Points at PROD or TEST Supabase depending on
 * the ambient environment context set by the webhook route (see
 * lib/env-context.ts) — a single Meta app receives webhooks for both the
 * production and the test WhatsApp numbers, each backed by its own Supabase
 * project. Outside of a webhook request (Admin pages, cron), no context is
 * set and this always resolves to PROD.
 */
export function createServiceClient() {
  const ctx = getCurrentEnvContext();
  return createSupabaseClient<Database>(
    ctx.supabaseUrl,
    ctx.supabaseServiceRoleKey,
    { auth: { persistSession: false }, global: { fetch: noStoreFetch } }
  );
}
