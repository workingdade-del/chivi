// Usage: node scripts/create-staff-user.mjs <email> <password>
// Crée (ou met à jour le mot de passe d'un) compte Supabase Auth utilisé
// pour se connecter aux PWA Cuisine et Admin (RLS: authenticated = staff).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/create-staff-user.mjs <email> <password>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data: existing } = await supabase.auth.admin.listUsers();
const found = existing?.users.find((u) => u.email === email);

if (found) {
  const { error } = await supabase.auth.admin.updateUserById(found.id, { password });
  if (error) throw error;
  console.log(`Mot de passe mis à jour pour ${email}`);
} else {
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`Compte staff créé pour ${email}`);
}
