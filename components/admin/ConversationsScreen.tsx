"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ConversationSummary {
  profile_id: string;
  whatsapp_phone: string;
  full_name: string | null;
  ai_active: boolean;
  last_message: string | null;
  last_direction: "inbound" | "outbound";
  last_message_type: string;
  last_message_at: string;
}

interface WhatsappMessageRow {
  id: string;
  direction: "inbound" | "outbound";
  content: string | null;
  message_type: string;
  created_at: string;
}

function initialOf(name: string | null, phone: string): string {
  return (name || phone)[0]?.toUpperCase() ?? "?";
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ConversationsScreen() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessageRow[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("conversation_summaries")
      .select("*")
      .order("last_message_at", { ascending: false });
    if (data) setConversations(data as ConversationSummary[]);
  }, []);

  const fetchMessages = useCallback(async (profileId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("id, direction, content, message_type, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as WhatsappMessageRow[]);
  }, []);

  // Un ref pour lire la sélection courante depuis le callback Realtime
  // sans re-souscrire à chaque changement de conversation ouverte.
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    fetchConversations();
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-conversations:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, (payload) => {
        fetchConversations();
        const row = (payload.new ?? payload.old) as { profile_id?: string } | null;
        if (row?.profile_id && row.profile_id === selectedIdRef.current) {
          fetchMessages(row.profile_id);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => fetchConversations())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, fetchMessages]);

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selected = useMemo(() => conversations.find((c) => c.profile_id === selectedId) ?? null, [conversations, selectedId]);

  async function toggleAI() {
    if (!selected) return;
    const supabase = createClient();
    await supabase.from("profiles").update({ ai_active: !selected.ai_active }).eq("id", selected.profile_id);
    setConversations((prev) =>
      prev.map((c) => (c.profile_id === selected.profile_id ? { ...c, ai_active: !c.ai_active } : c))
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
        body: JSON.stringify({ profileId: selected.profile_id, phone: selected.whatsapp_phone, message: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de l'envoi");
      }
      await fetchMessages(selected.profile_id);
      await fetchConversations();
    } catch (err) {
      setReplyText(text);
      alert(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex gap-4 h-full">
      <div className="w-[340px] flex-none bg-white border border-[#ece2cd] rounded-2xl overflow-y-auto">
        {conversations.length === 0 && (
          <div className="p-5 text-center text-[#9a8b78] text-sm">Aucune conversation pour le moment.</div>
        )}
        {conversations.map((c) => {
          const active = c.profile_id === selectedId;
          return (
            <button
              key={c.profile_id}
              onClick={() => setSelectedId(c.profile_id)}
              className={`w-full flex items-start gap-3 px-4 py-3.5 border-b border-[#f3ecdd] text-left ${
                active ? "bg-[#faf4e8]" : "bg-white"
              }`}
            >
              <div className="w-10 h-10 flex-none rounded-full bg-[#f4ead2] text-maroon flex items-center justify-center font-mega">
                {initialOf(c.full_name, c.whatsapp_phone)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <b className="font-semibold text-[14px] text-ink truncate">{c.full_name || c.whatsapp_phone}</b>
                  <span className="text-[11px] text-[#9a8b78] flex-none">
                    {new Date(c.last_message_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-[12.5px] text-[#9a8b78] truncate mt-0.5">
                  {c.last_direction === "outbound" ? "Vous : " : ""}
                  {c.last_message}
                </div>
                <span
                  className={`inline-flex items-center gap-1 mt-1.5 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                    c.ai_active ? "bg-status-green-bg text-status-green-deep" : "bg-[rgba(255,182,0,.16)] text-[#a6740a]"
                  }`}
                >
                  {c.ai_active ? <Bot size={11} /> : <UserRound size={11} />}
                  {c.ai_active ? "IA" : "Manuel"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-w-0 bg-white border border-[#ece2cd] rounded-2xl flex flex-col">
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
                  {initialOf(selected.full_name, selected.whatsapp_phone)}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[15px] text-ink truncate">
                    {selected.full_name || selected.whatsapp_phone}
                  </div>
                  <div className="text-xs text-[#9a8b78]">{selected.whatsapp_phone}</div>
                </div>
              </div>
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
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2.5 bg-[#faf6ee]">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      m.direction === "outbound"
                        ? "bg-maroon text-gold rounded-br-sm"
                        : "bg-white border border-[#ece2cd] text-ink rounded-bl-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    <div className={`text-[10.5px] mt-1 ${m.direction === "outbound" ? "text-cream/70" : "text-[#9a8b78]"}`}>
                      {timeLabel(m.created_at)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>

            <div className="flex-none flex items-center gap-2.5 px-4 py-3.5 border-t border-[#efe6d3]">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={selected.ai_active}
                placeholder={selected.ai_active ? "Prends la main pour répondre manuellement…" : "Écrire une réponse…"}
                className="flex-1 border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm disabled:bg-[#faf6ee] disabled:text-[#b0a596]"
              />
              <button
                onClick={handleSend}
                disabled={sending || !replyText.trim() || selected.ai_active}
                className="flex-none w-11 h-11 rounded-xl bg-maroon text-gold flex items-center justify-center disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
