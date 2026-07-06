"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, Mail, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ClientRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface SendHistoryRow {
  id: string;
  subject: string;
  template: string | null;
  channel: "email" | "whatsapp";
  recipient_count: number;
  created_at: string;
}

const TEMPLATES: { id: string; label: string; subject: string; message: string }[] = [
  {
    id: "promo",
    label: "Promo",
    subject: "Une offre spéciale CHIVI rien que pour toi 🎁",
    message: "Bonjour !\n\nProfite de notre offre spéciale cette semaine sur nos plats CHIVI préférés.\n\nÀ très vite,\nL'équipe CHIVI",
  },
  {
    id: "nouveau_plat",
    label: "Nouveau plat",
    subject: "Un nouveau plat vient d'arriver chez CHIVI 🍽️",
    message: "Bonjour !\n\nOn a ajouté un nouveau plat au menu — viens le découvrir vite.\n\nÀ très vite,\nL'équipe CHIVI",
  },
  {
    id: "evenement",
    label: "Événement",
    subject: "CHIVI organise quelque chose de spécial 🎉",
    message: "Bonjour !\n\nOn prépare un évènement que tu ne voudras pas manquer. Reste connecté(e) !\n\nÀ très vite,\nL'équipe CHIVI",
  },
];

export function MarketingScreen() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [history, setHistory] = useState<SendHistoryRow[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [template, setTemplate] = useState<string | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [sendingNewsletter, setSendingNewsletter] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [{ data: profiles }, { data: sends }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").not("email", "is", null).order("full_name"),
      supabase.from("newsletter_sends").select("id, subject, template, channel, recipient_count, created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    if (profiles) setClients(profiles as ClientRow[]);
    if (sends) setHistory(sends as SendHistoryRow[]);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTemplate(id);
    setSubject(t.subject);
    setMessage(t.message);
  }

  async function handleSendNewsletter() {
    setSendingNewsletter(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/marketing/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, template }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec de l'envoi");
      setFeedback(`Newsletter envoyée à ${data.sent}/${data.totalOptedIn} client(s).`);
      fetchAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setSendingNewsletter(false);
    }
  }

  async function handleBroadcast() {
    setSendingBroadcast(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/marketing/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: broadcastMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec de l'envoi");
      setFeedback(`Diffusion WhatsApp envoyée à ${data.sent}/${data.totalRecipients} client(s) récents.`);
      setBroadcastMessage("");
      fetchAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setSendingBroadcast(false);
    }
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
      <div className="flex flex-col gap-4">
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="font-bold text-sm text-ink mb-3.5 flex items-center gap-2">
            <Mail size={16} /> Newsletter — {clients.length} client(s) opt-in
          </div>
          <div className="flex gap-2 mb-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                  template === t.id ? "bg-amber text-maroon-deep" : "bg-[#faf4e8] text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Sujet de l'email"
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-2.5"
          />
          <textarea
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Contenu de la newsletter…"
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm resize-none"
          />
          <button
            onClick={handleSendNewsletter}
            disabled={sendingNewsletter || !subject.trim() || !message.trim()}
            className="w-full mt-3 py-3 rounded-xl bg-maroon text-gold font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send size={15} />
            {sendingNewsletter ? "Envoi…" : "Envoyer la newsletter"}
          </button>
        </div>

        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="font-bold text-sm text-ink mb-3.5 flex items-center gap-2">
            <MessageCircle size={16} /> Diffusion WhatsApp — clients ayant commandé sous 30 jours
          </div>
          <textarea
            rows={3}
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            placeholder="Message WhatsApp à diffuser…"
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm resize-none"
          />
          <button
            onClick={handleBroadcast}
            disabled={sendingBroadcast || !broadcastMessage.trim()}
            className="w-full mt-3 py-3 rounded-xl bg-whatsapp text-[#053d1c] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send size={15} />
            {sendingBroadcast ? "Envoi…" : "Diffuser sur WhatsApp"}
          </button>
        </div>

        {feedback && <div className="text-sm text-center text-ink bg-[#faf4e8] rounded-xl py-2.5">{feedback}</div>}
      </div>

      <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
        <div className="font-bold text-sm text-ink mb-3.5">Historique des envois</div>
        <div className="flex flex-col gap-2.5">
          {history.map((h) => (
            <div key={h.id} className="border-b border-[#f3ecdd] pb-2.5">
              <div className="flex justify-between items-start">
                <span className="font-semibold text-[13px] text-ink">{h.subject}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    h.channel === "email" ? "bg-status-blue-bg text-status-blue" : "bg-status-green-bg text-status-green-deep"
                  }`}
                >
                  {h.channel === "email" ? "Email" : "WhatsApp"}
                </span>
              </div>
              <div className="text-[11px] text-[#9a8b78] mt-1">
                {h.recipient_count} destinataire(s) ·{" "}
                {new Date(h.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))}
          {history.length === 0 && <div className="text-center text-[#9a8b78] text-sm py-8">Aucun envoi pour le moment.</div>}
        </div>
      </div>
    </div>
  );
}
