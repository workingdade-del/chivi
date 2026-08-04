"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

type ToastKind = "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

let listeners: ((toasts: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];
let nextId = 1;

function emit() {
  listeners.forEach((l) => l(toasts));
}

/** Déclenche un toast global — utilisable depuis n'importe quel composant client, sans provider/context. */
export function showToast(message: string, kind: ToastKind = "success") {
  const id = nextId++;
  toasts = [...toasts, { id, message, kind }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 3000);
}

/** À monter une seule fois, à la racine de l'app (app/layout.tsx) — couvre les 3 PWA. */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.push(setItems);
    return () => {
      listeners = listeners.filter((l) => l !== setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 items-end pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${
            t.kind === "success" ? "bg-status-green-deep" : "bg-chilli"
          }`}
        >
          {t.kind === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}
