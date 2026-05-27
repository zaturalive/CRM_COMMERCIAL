"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIAgentWhatsAppPreviewProps {
  patientFirstName: string;
}

type Author = "bot" | "patient";
interface Message {
  id: string;
  author: Author;
  text: string;
}

/**
 * EP06-S04 — Mock WhatsApp grise de l'Agent IA V1.
 *
 * Interactif (textarea + envoi). Les reponses bot sont deterministes via
 * un dict de patterns — aucune API IA n'est appelee. V1 : remplacer par
 * une connexion WebSocket vers l'API WhatsApp Business Cloud + Claude API.
 */
export function AIAgentWhatsAppPreview({ patientFirstName }: AIAgentWhatsAppPreviewProps) {
  // ADR-0002 + EP06-S04 reformulee (2026-05-20) : mocks commerciaux uniquement,
  // plus aucune reference a un document medical.
  const initial: Message[] = [
    {
      id: "m1",
      author: "bot",
      text: `Bonjour ${patientFirstName}, je suis l'assistante virtuelle du cabinet. Votre devis est pret a signer.`,
    },
    {
      id: "m2",
      author: "patient",
      text: "Super, je peux y jeter un oeil quand ?",
    },
    {
      id: "m3",
      author: "bot",
      text: "Vous pouvez le consulter via le lien que je viens de vous envoyer. Pouvez-vous m'envoyer votre RIB pour planifier l'acompte ?",
    },
    {
      id: "m4",
      author: "patient",
      text: "Bien sur, je fais ca ce soir.",
    },
    {
      id: "m5",
      author: "bot",
      text: "Parfait. Merci aussi d'envoyer votre carte d'identite pour finaliser le dossier. Le RDV de pre-prestation est confirme pour le 12 juin.",
    },
  ];

  const [messages, setMessages] = useState<Message[]>(initial);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  function pickBotReply(userText: string): string {
    // ADR-0002 + EP06-S04 : keywords commerciaux uniquement (devis, rib,
    // identite, rdv, acompte, solde, cgv). Pas de keyword medical.
    const t = userText.toLowerCase();
    if (/rib|prelevement|virement/.test(t)) {
      return "Parfait, je note que le RIB est envoye. Je vais pouvoir planifier l'acompte.";
    }
    if (/devis|sign|signature/.test(t)) {
      return "Super. Une fois le devis signe, n'oubliez pas de retourner les CGV signees.";
    }
    if (/identite|cni|passeport|justif/.test(t)) {
      return "Merci pour le document, je le transmets au cabinet.";
    }
    if (/rdv|rendez-vous|date|planning/.test(t)) {
      return "Je regarde les creneaux disponibles et je reviens vers vous.";
    }
    if (/acompte|solde|paiement|finance/.test(t)) {
      return "Je note votre paiement et je transmets au cabinet. Vous recevrez un recu sous 24h.";
    }
    if (/merci|thanks|parfait/.test(t)) {
      return "Avec plaisir ! N'hesitez pas si vous avez d'autres questions.";
    }
    return "Bien recu, je transmets au cabinet et je reviens vers vous rapidement.";
  }

  function send() {
    const txt = input.trim();
    if (!txt) return;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      author: "patient",
      text: txt,
    };
    const botMsg: Message = {
      id: `b-${Date.now()}`,
      author: "bot",
      text: pickBotReply(txt),
    };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
  }

  return (
    <div className="relative mx-auto w-full max-w-[400px]" style={{ opacity: 0.75 }}>
      <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-900 shadow">
        <Sparkles size={11} strokeWidth={2} /> V1 — Apercu
      </div>

      <div className="whatsapp-preview-protected overflow-hidden rounded-2xl border border-white/60 bg-white shadow-lg">
        <header className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <Bot size={18} strokeWidth={2} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Agent IA — Secretaire virtuelle</div>
            <div className="text-[11px] opacity-80">En ligne</div>
          </div>
        </header>

        <div
          className="h-[320px] space-y-2 overflow-y-auto p-3"
          style={{ background: "#E5DDD5" }}
        >
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
          <div ref={endRef} />
        </div>

        <div className="flex items-end gap-2 border-t border-gray-200 bg-gray-50 p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ecrire un message..."
            rows={1}
            className="flex-1 resize-none rounded-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#075E54]"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim()}
            aria-label="Envoyer"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition",
              input.trim()
                ? "bg-[#075E54] text-white hover:brightness-110"
                : "bg-gray-300 text-gray-500"
            )}
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-text-secondary">
        Connexion API WhatsApp Business Cloud prevue en V1.
      </p>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isBot = msg.author === "bot";
  return (
    <div className={cn("flex", isBot ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3 py-2 text-sm shadow",
          isBot ? "bg-white text-text-primary" : "bg-[#DCF8C6] text-text-primary"
        )}
      >
        {msg.text}
      </div>
    </div>
  );
}
