import { useEffect, useRef, useState } from "react";
import { Sparkle, X, Send } from "@/components/findable-icons";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export type HiringAssistantFormContext = {
  name?: string;
  email?: string;
  linkedin?: string;
  location?: string;
  resume_filename?: string;
  answers?: Record<string, string | string[]>;
};

const SUGGESTIONS = [
  "What does the interview process look like?",
  "How long does it take, start to finish?",
  "Is it remote or in person?",
  "Any feedback on my profile?",
];

export function HiringAssistant({
  slug,
  formContext,
}: {
  slug: string;
  formContext: HiringAssistantFormContext;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm the hiring assistant for this role. Ask me anything about the process, the interviews, or how your profile lines up.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const showSuggestions = messages.filter((m) => m.role === "user").length === 0;

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [open, messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`/api/public/jobs/${encodeURIComponent(slug)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          formContext,
        }),
      });
      if (res.status === 429) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "We're getting a lot of questions right now — try again in a moment." },
        ]);
        return;
      }
      const data = await res.json().catch(() => ({}) as any);
      const assistant =
        typeof data?.assistant === "string" && data.assistant
          ? data.assistant
          : "I couldn't reach the assistant. Please try again in a moment.";
      setMessages((m) => [...m, { role: "assistant", content: assistant }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Network hiccup — please try again in a moment." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-border bg-bg-elev px-4 py-2.5 text-[13px] font-medium text-text shadow-md transition hover:bg-bg-input"
        >
          <Sparkle size={14} className="text-text-mute" />
          Questions about this role?
        </button>
      )}

      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-elev shadow-xl",
            "bottom-4 right-4 left-4 max-h-[80vh] h-[600px]",
            "sm:left-auto sm:right-5 sm:bottom-5 sm:w-[380px] sm:h-[560px]",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-text text-text-invert">
                <Sparkle size={13} />
              </div>
              <div>
                <div className="text-[13.5px] font-semibold leading-tight">Hiring assistant</div>
                <div className="flex items-center gap-1 text-[11.5px] text-text-mute">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Answers about this role
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded text-text-mute hover:bg-bg-input"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-text text-text-invert"
                    : "bg-bg-input text-text",
                )}
              >
                {m.role === "assistant" ? (
                  <Markdown className="text-[13.5px]">{m.content}</Markdown>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            ))}
            {busy && (
              <div className="max-w-[60%] rounded-2xl bg-bg-input px-3.5 py-2.5 text-[13.5px] text-text-mute">
                <span className="inline-flex gap-1">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </span>
              </div>
            )}

            {showSuggestions && !busy && (
              <div className="space-y-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="block w-full rounded-xl border border-border bg-bg-elev px-3.5 py-2 text-left text-[13px] text-text transition hover:bg-bg-input"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="border-t border-border bg-bg-elev px-3 py-2.5"
          >
            <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-input px-3 py-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about the process, interviews…"
                disabled={busy}
                className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-text-faint"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-text text-text-invert transition hover:opacity-90 disabled:opacity-40"
                aria-label="Send"
              >
                <Send size={13} />
              </button>
            </div>
            <div className="mt-1.5 text-center text-[11px] text-text-faint">
              AI assistant · answers may be approximate
            </div>
          </form>
        </div>
      )}
    </>
  );
}