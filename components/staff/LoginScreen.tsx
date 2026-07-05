"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginScreen({ appName, redirectTo }: { appName: string; redirectTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Identifiants incorrects.");
      setLoading(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-maroon px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl p-8 flex flex-col gap-4">
        <div
          className="w-32 h-9 bg-left bg-contain bg-no-repeat mx-auto mb-2"
          style={{ backgroundImage: "url('/brand_kit/assets/logo/chivi-wordmark-alt.png')" }}
        />
        <div className="font-display uppercase text-center text-maroon text-sm tracking-wide">
          {appName}
        </div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="border-2 border-[#e6dcc4] rounded-xl px-4 py-3 text-sm"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="border-2 border-[#e6dcc4] rounded-xl px-4 py-3 text-sm"
        />
        {error && <div className="text-sm text-chilli text-center">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="bg-maroon text-gold font-bold rounded-xl py-3 disabled:opacity-50"
        >
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
