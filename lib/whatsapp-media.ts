import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const BUCKET = "whatsapp-media";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

export function extensionFor(mimeType: string): string {
  const clean = mimeType.split(";")[0].trim();
  return EXTENSION_BY_MIME[clean] ?? clean.split("/")[1] ?? "bin";
}

/** Télécharge un média déjà stocké dans whatsapp-media (ex : audio brut à reconvertir). */
export async function downloadStoredMedia(supabase: SupabaseClient<Database>, path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Échec téléchargement média stocké: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Supprime un objet du bucket whatsapp-media (ex : fichier brut superseded par une version convertie). */
export async function deleteStoredMedia(supabase: SupabaseClient<Database>, path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

/**
 * Upload un média WhatsApp (entrant ou sortant) vers le bucket Storage privé
 * "whatsapp-media". Retourne le chemin objet (pas d'URL — le bucket est privé
 * car ces fichiers peuvent contenir des données personnelles), à utiliser
 * ensuite avec getSignedMediaUrl pour l'affichage ou l'envoi à Meta.
 */
export async function uploadWhatsappMedia(
  supabase: SupabaseClient<Database>,
  buffer: Buffer,
  mimeType: string,
  normalizedPhone: string
): Promise<string> {
  const path = `${normalizedPhone}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(mimeType)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Échec upload média WhatsApp: ${error.message}`);
  return path;
}

/** Génère une URL signée temporaire pour afficher ou envoyer un média stocké. */
export async function getSignedMediaUrl(
  supabase: SupabaseClient<Database>,
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.error("[whatsapp-media] échec génération URL signée", { path, error });
    return null;
  }
  return data.signedUrl;
}
