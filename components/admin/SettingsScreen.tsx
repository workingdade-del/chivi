"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { compressImage } from "@/lib/image-compress";

export function SettingsScreen() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/settings/business-profile-photo")
      .then((res) => res.json())
      .then((body) => setPhotoUrl(body.photoUrl ?? null))
      .finally(() => setLoading(false));
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(false);
    try {
      const compressed = await compressImage(file, 640, 0.85).catch(() => file);
      const formData = new FormData();
      formData.append("photo", compressed, "profile.jpg");

      const res = await fetch("/api/admin/settings/business-profile-photo", {
        method: "POST",
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Échec de la mise à jour");

      setPhotoUrl(URL.createObjectURL(compressed));
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la mise à jour");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white border border-[#ece2cd] rounded-2xl p-6">
        <h2 className="font-bold text-lg text-ink mb-1">Photo de profil business WhatsApp</h2>
        <p className="text-sm text-[#9a8b78] mb-5">
          Visible par tous les clients dans WhatsApp. Le changement peut prendre quelques minutes à apparaître côté Meta.
        </p>

        <div className="flex items-center gap-5">
          <div className="w-24 h-24 rounded-full bg-[#f4ead2] flex-none overflow-hidden flex items-center justify-center">
            {loading ? (
              <span className="text-xs text-[#9a8b78]">…</span>
            ) : photoUrl ? (
              <Image src={photoUrl} alt="Photo de profil CHIVI" width={96} height={96} className="object-cover w-full h-full" unoptimized />
            ) : (
              <span className="text-xs text-[#9a8b78] px-2 text-center">Aucune photo</span>
            )}
          </div>

          <div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-maroon text-gold font-bold text-sm rounded-xl px-4 py-2.5 disabled:opacity-50"
            >
              {uploading ? "Envoi en cours…" : "Changer la photo"}
            </button>
            {error && <div className="text-sm text-chilli mt-2.5 max-w-xs">{error}</div>}
            {success && <div className="text-sm text-status-green-deep mt-2.5">Photo mise à jour avec succès.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
