"use client";

import { FormEvent, useState } from "react";

type Audience = "customer" | "provider";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type SupportChatProps = {
  audience: Audience;
  tone: "customer" | "pro";
};

const TONES = {
  customer: {
    panel: "border-[#c5d6c6] bg-white",
    user: "bg-[#1f4d2c] text-[#f1f7ed]",
    assistant: "bg-[#e7f2e8] text-[#1c3f23]",
    button: "bg-[#1f4d2c] text-[#f1f7ed] hover:bg-[#173a21]",
    input: "border-[#c5d6c6] focus:border-[#3f7449] focus:ring-[#3f7449]/20",
    muted: "text-[#4a6450]",
  },
  pro: {
    panel: "border-[#d8ccb2] bg-[#fffdf7]",
    user: "bg-[#1f3c25] text-[#f5ecda]",
    assistant: "bg-[#f3ead8] text-[#1f3a24]",
    button: "bg-[#1f3c25] text-[#f5ecda] hover:bg-[#17311e]",
    input: "border-[#d8ccb2] focus:border-[#527154] focus:ring-[#527154]/20",
    muted: "text-[#4b5f4a]",
  },
} as const;

function transcript(messages: ChatMessage[]) {
  return messages
    .map((message) => `${message.role === "user" ? "Visitor" : "Helpr Support"}: ${message.content}`)
    .join("\n\n");
}

export default function SupportChat({ audience, tone }: SupportChatProps) {
  const colors = TONES[tone];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escalate, setEscalate] = useState(false);
  const [email, setEmail] = useState("");
  const [escalationNote, setEscalationNote] = useState<string | null>(null);
  const [escalationError, setEscalationError] = useState<string | null>(null);
  const [escalating, setEscalating] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setSending(true);
    setError(null);
    setEscalationNote(null);
    setEscalationError(null);

    try {
      const response = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          channel: "website",
          messages: nextMessages,
        }),
      });
      const body = (await response.json()) as {
        reply?: string;
        escalate?: boolean;
        message?: string;
      };

      if (!response.ok || typeof body.reply !== "string" || body.reply.trim().length === 0) {
        setError(
          body.message ||
            "Support chat did not return a reply. Nothing was answered.",
        );
        return;
      }

      setMessages([
        ...nextMessages,
        { role: "assistant", content: body.reply.trim() },
      ]);
      setDraft("");
      setEscalate(body.escalate === true);
    } catch {
      setError("Support chat could not be reached. Nothing was answered.");
    } finally {
      setSending(false);
    }
  }

  async function sendEscalation(event: FormEvent) {
    event.preventDefault();
    if (escalating || messages.length === 0) return;
    setEscalating(true);
    setEscalationNote(null);
    setEscalationError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          supportType: audience === "provider" ? "pro" : "customer",
          source: "support-chat",
          message: transcript(messages),
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setEscalationError(
          body.message || "Your message could not be sent. Nothing was delivered.",
        );
        return;
      }
      setEscalationNote(body.message || "Your message was sent to Helpr support.");
    } catch {
      setEscalationError("Your message could not be sent. Nothing was delivered.");
    } finally {
      setEscalating(false);
    }
  }

  return (
    <div className={`rounded-2xl border p-4 ${colors.panel}`}>
      <p className={`text-sm ${colors.muted}`}>
        Ask about how Helpr works, job statuses, or the 3% processing and 1%
        platform fees. This chat cannot change a booking or message a pro.
      </p>

      <div className="mt-4 space-y-3" aria-live="polite">
        {messages.length === 0 ? (
          <p className={`text-sm ${colors.muted}`}>
            No messages yet. A reply appears here only after support chat responds.
          </p>
        ) : (
          messages.map((message, index) => (
            <p
              key={`${message.role}-${index}`}
              className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === "user" ? `ml-auto ${colors.user}` : colors.assistant
              }`}
            >
              {message.content}
            </p>
          ))
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-[#8a2a2a]/30 bg-[#fdecec] px-4 py-3 text-sm text-[#8a2a2a]">
          {error}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor={`support-draft-${audience}`}>
          Message to Helpr support
        </label>
        <input
          id={`support-draft-${audience}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask Helpr support"
          maxLength={1500}
          className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${colors.input}`}
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${colors.button}`}
        >
          {sending ? "Sending" : "Send"}
        </button>
      </form>

      {escalate ? (
        <form onSubmit={sendEscalation} className="mt-4 space-y-3 border-t border-black/10 pt-4">
          <p className={`text-sm ${colors.muted}`}>
            A person needs to follow up. This chat has not emailed anyone yet.
            Send the conversation to Helpr support, or use the form below.
          </p>
          <label className="block text-sm font-medium" htmlFor={`support-email-${audience}`}>
            Your email
          </label>
          <input
            id={`support-email-${audience}`}
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${colors.input}`}
          />
          <button
            type="submit"
            disabled={escalating}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${colors.button}`}
          >
            {escalating ? "Sending" : "Email this conversation"}
          </button>
          {escalationNote ? (
            <p role="status" className="text-sm text-[#1f4d2c]">
              {escalationNote}
            </p>
          ) : null}
          {escalationError ? (
            <p role="alert" className="text-sm text-[#8a2a2a]">
              {escalationError}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
