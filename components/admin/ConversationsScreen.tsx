"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, UserRound, Bike, HelpCircle, Plus, X, Mic, Square, Paperclip, FileText, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { useStaffNotificationsStore, isConversationUnread } from "@/lib/store/staff-notifications";
import { avatarColorFor } from "@/lib/avatar-color";

interface ConversationSummary {
  normalized_phone: string;
  phone: string;
  profile_id: string | null;
  driver_id: string | null;
  contact_name: string | null;
  contact_type: "client" | "livreur" | "inconnu";
  ai_active: boolean | null;
  last_message: string | null;
  last_direction: "inbound" | "outbound";
  last_message_type: string;
  last_media_path: string | null;
  last_message_at: string;
}

interface WhatsappMessageRow {
  id: string;
  direction: "inbound" | "outbound";
  content: string | null;
  message_type: string;
  media_path: string | null;
  media_mime_type: string | null;
  created_at: string;
}

function normalizePhoneLocal(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

function initialOf(name: string | null, phone: string): string {
  return (name || phone)[0]?.toUpperCase() ?? "?";
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function contactBadge(type: ConversationSummary["contact_type"]) {
  if (type === "client") return { label: "Client", icon: UserRound, className: "bg-status-green-bg text-status-green-deep" };
  if (type === "livreur") return { label: "Livreur", icon: Bike, className: "bg-[rgba(124,0,0,.1)] text-maroon" };
  return { label: "Inconnu", icon: HelpCircle, className: "bg-[rgba(154,139,120,.16)] text-[#8a7c6a]" };
}

function pickRecordingMimeType(): string {
  const candidates = ["audio/mp4", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function ConversationsScreen() {
  const lastViewedByPhone = useStaffNotificationsStore((s) => s.lastViewedByPhone);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessageRow[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newConvoPhone, setNewConvoPhone] = useState("");
  const [newConvoMessage, setNewConvoMessage] = useState("");
  const [newConvoBusy, setNewConvoBusy] = useState(false);
  const [newConvoError, setNewConvoError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("all_conversations")
      .select("*")
      .order("last_message_at", { ascending: false });
    if (data) setConversations(data as ConversationSummary[]);
  }, []);

  const fetchMessages = useCallback(async (normalizedPhone: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("id, direction, content, message_type, media_path, media_mime_type, created_at")
      .eq("normalized_phone", normalizedPhone)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as WhatsappMessageRow[]);
  }, []);

  // Un ref pour lire la sélection courante depuis le callback Realtime
  // sans re-souscrire à chaque changement de conversation ouverte.
  const selectedPhoneRef = useRef<string | null>(null);
  useEffect(() => {
    selectedPhoneRef.current = selectedPhone;
  }, [selectedPhone]);

  useEffect(() => {
    fetchConversations();
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-conversations:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, (payload) => {
        fetchConversations();
        const row = (payload.new ?? payload.old) as { normalized_phone?: string } | null;
        if (row?.normalized_phone && row.normalized_phone === selectedPhoneRef.current) {
          fetchMessages(row.normalized_phone);
          // La conversation ouverte reste "lue" même si un nouveau message
          // entrant arrive pendant qu'on la regarde déjà.
          useStaffNotificationsStore.getState().markViewed(row.normalized_phone);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => fetchConversations())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, fetchMessages]);

  useEffect(() => {
    if (selectedPhone) {
      fetchMessages(selectedPhone);
      useStaffNotificationsStore.getState().markViewed(selectedPhone);
    }
  }, [selectedPhone, fetchMessages]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Résout les chemins Storage des médias affichés en URLs signées (le
  // bucket whatsapp-media est privé) — un seul appel groupé par lot de
  // messages plutôt qu'une requête par bulle.
  useEffect(() => {
    const pending = messages.filter((m) => m.media_path && !mediaUrls[m.media_path]);
    if (pending.length === 0) return;
    const supabase = createClient();
    (async () => {
      const paths = [...new Set(pending.map((m) => m.media_path as string))];
      const { data } = await supabase.storage.from("whatsapp-media").createSignedUrls(paths, 3600);
      if (!data) return;
      setMediaUrls((prev) => {
        const next = { ...prev };
        data.forEach((d) => {
          if (d.signedUrl && d.path) next[d.path] = d.signedUrl;
        });
        return next;
      });
    })();
  }, [messages, mediaUrls]);

  const selected = useMemo(
    () => conversations.find((c) => c.normalized_phone === selectedPhone) ?? null,
    [conversations, selectedPhone]
  );

  async function toggleAI() {
    if (!selected?.profile_id) return;
    const supabase = createClient();
    await supabase.from("profiles").update({ ai_active: !selected.ai_active }).eq("id", selected.profile_id);
    setConversations((prev) =>
      prev.map((c) => (c.normalized_phone === selected.normalized_phone ? { ...c, ai_active: !c.ai_active } : c))
    );
  }

  async function handleSend() {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    const text = replyText;
    setReplyText("");
    try {
      const res = await fetch("/api/admin/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: selected.profile_id,
          driverId: selected.driver_id,
          phone: selected.phone,
          message: text,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de l'envoi");
      }
      await fetchMessages(selected.normalized_phone);
      await fetchConversations();
    } catch (err) {
      setReplyText(text);
      alert(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setSending(false);
    }
  }

  async function sendMediaMessage(params: {
    mediaPath: string;
    mediaType: "image" | "audio" | "document";
    mimeType: string;
    caption?: string;
    filename?: string;
  }) {
    if (!selected) return;
    const res = await fetch("/api/admin/whatsapp/send-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: selected.profile_id,
        driverId: selected.driver_id,
        phone: selected.phone,
        ...params,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Échec de l'envoi du média");
    }
    await fetchMessages(selected.normalized_phone);
    await fetchConversations();
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selected) return;
    setAttaching(true);
    try {
      const isImage = file.type.startsWith("image/");
      const toUpload = isImage ? await compressImage(file).catch(() => file) : file;
      const mimeType = isImage ? "image/jpeg" : file.type || "application/octet-stream";
      const ext = isImage ? "jpg" : (file.name.split(".").pop() ?? "bin");
      const path = `${selected.normalized_phone}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const supabase = createClient();
      const { error } = await supabase.storage.from("whatsapp-media").upload(path, toUpload, {
        contentType: mimeType,
        upsert: false,
      });
      if (error) throw new Error(error.message);

      await sendMediaMessage({
        mediaPath: path,
        mediaType: isImage ? "image" : "document",
        mimeType,
        filename: isImage ? undefined : file.name,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec de l'envoi de la pièce jointe");
    } finally {
      setAttaching(false);
    }
  }

  async function handleMicClick() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (!selected) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        const blobType = mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: blobType });
        if (blob.size === 0 || !selected) return;

        setRecordingBusy(true);
        try {
          const ext = blobType.includes("mp4") ? "m4a" : blobType.includes("ogg") ? "ogg" : "webm";
          const path = `${selected.normalized_phone}/${Date.now()}-voice.${ext}`;
          const supabase = createClient();
          const { error } = await supabase.storage.from("whatsapp-media").upload(path, blob, {
            contentType: blobType,
            upsert: false,
          });
          if (error) throw new Error(error.message);

          await sendMediaMessage({ mediaPath: path, mediaType: "audio", mimeType: blobType });
        } catch (err) {
          alert(err instanceof Error ? err.message : "Échec de l'envoi du message vocal");
        } finally {
          setRecordingBusy(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      alert("Impossible d'accéder au micro. Vérifie les permissions du navigateur.");
    }
  }

  async function handleStartConversation() {
    if (!newConvoPhone.trim() || !newConvoMessage.trim()) return;
    setNewConvoBusy(true);
    setNewConvoError(null);
    try {
      const res = await fetch("/api/admin/whatsapp/start-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newConvoPhone, message: newConvoMessage }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNewConvoError(body.error ?? "Échec de l'envoi");
        return;
      }
      setShowNewConvo(false);
      const normalized = normalizePhoneLocal(newConvoPhone);
      setNewConvoPhone("");
      setNewConvoMessage("");
      await fetchConversations();
      setSelectedPhone(normalized);
    } finally {
      setNewConvoBusy(false);
    }
  }

  return (
    <div className="flex gap-4 h-full min-h-0">
      <div className="w-[340px] flex-none bg-white border border-[#ece2cd] rounded-2xl overflow-y-auto flex flex-col">
        <div className="flex-none p-3 border-b border-[#f3ecdd]">
          <button
            onClick={() => {
              setShowNewConvo(true);
              setNewConvoError(null);
            }}
            className="w-full flex items-center justify-center gap-2 bg-maroon text-gold font-bold text-sm rounded-xl px-3.5 py-2.5"
          >
            <Plus size={16} /> Nouvelle conversation
          </button>
        </div>

        {conversations.length === 0 && (
          <div className="p-5 text-center text-[#9a8b78] text-sm">Aucune conversation pour le moment.</div>
        )}
        {conversations.map((c) => {
          const active = c.normalized_phone === selectedPhone;
          const badge = contactBadge(c.contact_type);
          const BadgeIcon = badge.icon;
          const unread = isConversationUnread(lastViewedByPhone, c.normalized_phone, c.last_direction, c.last_message_at);
          return (
            <button
              key={c.normalized_phone}
              onClick={() => setSelectedPhone(c.normalized_phone)}
              className={`w-full flex items-start gap-3 px-4 py-3.5 border-b border-[#f3ecdd] text-left ${
                active ? "bg-[#faf4e8]" : "bg-white"
              }`}
            >
              <div
                className="w-10 h-10 flex-none rounded-full flex items-center justify-center font-mega"
                style={{ background: avatarColorFor(c.normalized_phone).bg, color: avatarColorFor(c.normalized_phone).text }}
              >
                {initialOf(c.contact_name, c.phone)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {unread && <span className="w-2 h-2 flex-none rounded-full bg-chilli" />}
                    <b className={`text-[14px] text-ink truncate ${unread ? "font-bold" : "font-semibold"}`}>{c.contact_name || c.phone}</b>
                  </span>
                  <span className="text-[11px] text-[#9a8b78] flex-none">
                    {new Date(c.last_message_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className={`text-[12.5px] truncate mt-0.5 ${unread ? "text-ink font-medium" : "text-[#9a8b78]"}`}>
                  {c.last_direction === "outbound" ? "Vous : " : ""}
                  {c.last_message ?? (c.last_message_type === "audio" ? "🎤 Message vocal" : c.last_message_type === "image" ? "📷 Image" : c.last_message_type === "document" ? "📄 Document" : c.last_message_type)}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
                    <BadgeIcon size={11} />
                    {badge.label}
                  </span>
                  {c.contact_type === "client" && (
                    <span
                      className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                        c.ai_active ? "bg-status-green-bg text-status-green-deep" : "bg-[rgba(255,182,0,.16)] text-[#a6740a]"
                      }`}
                    >
                      {c.ai_active ? <Bot size={11} /> : <UserRound size={11} />}
                      {c.ai_active ? "IA" : "Manuel"}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-w-0 min-h-0 bg-white border border-[#ece2cd] rounded-2xl flex flex-col">
        {!selected && (
          <div className="flex-1 flex items-center justify-center text-[#9a8b78] text-sm">
            Sélectionne une conversation pour voir l&apos;historique.
          </div>
        )}
        {selected && (
          <>
            <div className="flex-none flex items-center justify-between gap-3 px-5 py-4 border-b border-[#efe6d3]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 flex-none rounded-full bg-maroon text-gold flex items-center justify-center font-mega">
                  {initialOf(selected.contact_name, selected.phone)}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[15px] text-ink truncate">{selected.contact_name || selected.phone}</div>
                  <div className="text-xs text-[#9a8b78]">{selected.phone}</div>
                </div>
              </div>
              {selected.contact_type === "client" && selected.profile_id && (
                <div className="flex items-center gap-2.5 flex-none">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                      selected.ai_active ? "bg-status-green-bg text-status-green-deep" : "bg-[rgba(255,182,0,.16)] text-[#a6740a]"
                    }`}
                  >
                    {selected.ai_active ? <Bot size={13} /> : <UserRound size={13} />}
                    {selected.ai_active ? "IA active" : "Manuel"}
                  </span>
                  <button
                    onClick={toggleAI}
                    className={`text-xs font-bold px-3.5 py-2 rounded-xl ${
                      selected.ai_active ? "bg-amber text-maroon-deep" : "bg-maroon text-gold"
                    }`}
                  >
                    {selected.ai_active ? "Prendre la main" : "Rendre à l'IA"}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-2.5 bg-[#faf6ee]">
              {messages.map((m) => {
                const url = m.media_path ? mediaUrls[m.media_path] : null;
                return (
                  <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        m.direction === "outbound"
                          ? "bg-maroon text-gold rounded-br-sm"
                          : "bg-white border border-[#ece2cd] text-ink rounded-bl-sm"
                      }`}
                    >
                      {m.message_type === "image" && url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="Image envoyée" className="rounded-xl max-w-full max-h-72 mb-1.5 object-contain" />
                      )}
                      {m.message_type === "audio" && (
                        <>
                          {url ? (
                            <audio controls src={url} className="max-w-full mb-1" />
                          ) : (
                            <div className={`text-xs italic mb-1 ${m.direction === "outbound" ? "text-cream/70" : "text-[#b0a596]"}`}>
                              Audio indisponible
                            </div>
                          )}
                          {m.content && (
                            <div className={`text-xs italic mt-0.5 ${m.direction === "outbound" ? "text-cream/70" : "text-[#9a8b78]"}`}>
                              Transcription automatique : {m.content}
                            </div>
                          )}
                        </>
                      )}
                      {m.message_type === "document" && url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center gap-2 mb-1 underline ${m.direction === "outbound" ? "text-gold" : "text-maroon"}`}
                        >
                          <FileText size={16} /> {m.content || "Document"} <Download size={13} />
                        </a>
                      )}
                      {m.content && m.message_type !== "document" && m.message_type !== "audio" && (
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      )}
                      <div className={`text-[10.5px] mt-1 ${m.direction === "outbound" ? "text-cream/70" : "text-[#9a8b78]"}`}>
                        {timeLabel(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>

            <div className="flex-none flex items-center gap-2.5 px-4 py-3.5 border-t border-[#efe6d3]">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleAttachFile}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={attaching || isRecording || recordingBusy}
                title="Joindre un fichier"
                className="flex-none w-11 h-11 rounded-xl bg-[#f4ead2] text-maroon flex items-center justify-center disabled:opacity-50"
              >
                <Paperclip size={18} />
              </button>
              <button
                onClick={handleMicClick}
                disabled={attaching || recordingBusy}
                title={isRecording ? "Arrêter l'enregistrement" : "Enregistrer un message vocal"}
                className={`flex-none w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-50 ${
                  isRecording ? "bg-chilli text-white animate-pulse" : "bg-[#f4ead2] text-maroon"
                }`}
              >
                {isRecording ? <Square size={16} /> : <Mic size={18} />}
              </button>
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Écrire une réponse…"
                className="flex-1 border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
              />
              <button
                onClick={handleSend}
                disabled={sending || !replyText.trim()}
                className="flex-none w-11 h-11 rounded-xl bg-maroon text-gold flex items-center justify-center disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
          </>
        )}
      </div>

      {showNewConvo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-ink text-lg">Nouvelle conversation</h3>
              <button onClick={() => setShowNewConvo(false)} className="text-[#9a8b78]">
                <X size={20} />
              </button>
            </div>
            <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Numéro WhatsApp</label>
            <input
              value={newConvoPhone}
              onChange={(e) => setNewConvoPhone(e.target.value)}
              placeholder="+229 XX XXX XXX"
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3"
            />
            <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Message</label>
            <textarea
              value={newConvoMessage}
              onChange={(e) => setNewConvoMessage(e.target.value)}
              rows={4}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3"
            />
            {newConvoError && (
              <div className="text-sm text-chilli bg-[rgba(231,50,35,.08)] rounded-xl px-3.5 py-2.5 mb-3">{newConvoError}</div>
            )}
            <button
              onClick={handleStartConversation}
              disabled={newConvoBusy || !newConvoPhone.trim() || !newConvoMessage.trim()}
              className="w-full bg-maroon text-gold font-bold text-sm rounded-xl px-3.5 py-3 disabled:opacity-50"
            >
              {newConvoBusy ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
