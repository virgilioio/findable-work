import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { claimGuestConversation } from "@/lib/conversations.functions";
import { AuthDialog, type AuthReason } from "@/components/auth/auth-dialog";
import { ClarifyCard, type ClarifyData } from "@/components/chat/clarify-card";
import {
  Logo,
  AppIcon,
  ChatGlyph,
  Wordmark,
  Send as SendIcon,
  Sparkle,
  Briefcase,
} from "@/components/findable-icons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "findable — your AI recruiter" },
      {
        name: "description",
        content:
          "Describe a role and findable drafts the job, finds candidates, and runs the loop. Try it free.",
      },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/app" });
  },
  component: HomePage,
});

// ----- guest session model (sessionStorage; cleared on refresh) ------

const SESSION_KEY = "findable:guest:v1";
const CLAIM_PENDING_KEY = "findable:claim-pending";

type GuestMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls?: unknown;
};

type GuestClarify = {
  taskId: string; // synthesized client-side
  data: ClarifyData;
  answered?: boolean;
  answers?: Record<string, string[]>;
  afterMessageId: string;
};

type DraftJob = {
  title?: string;
  description?: string;
  requirements?: string[];
  location?: string;
  employment_type?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string;
};

type GuestState = {
  guestId: string;
  messages: GuestMessage[];
  clarifies: GuestClarify[];
  draftJob?: DraftJob;
  exchangeCount: number;
  signupRequired: boolean;
  signupReason?: AuthReason;
  lastNudgeAt: number; // exchangeCount at which we last opened the dialog
};

function newGuestState(): GuestState {
  return {
    guestId: crypto.randomUUID(),
    messages: [],
    clarifies: [],
    exchangeCount: 0,
    signupRequired: false,
    lastNudgeAt: -10,
  };
}

function loadGuestState(): GuestState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as GuestState;
  } catch {
    /* ignore */
  }
  return newGuestState();
}

function saveGuestState(s: GuestState) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// --------------------------------------------------------------------

function HomePage() {
  const navigate = useNavigate();
  const claim = useServerFn(claimGuestConversation);

  const [state, setState] = useState<GuestState>(() => newGuestState());
  const [hydrated, setHydrated] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogReason, setDialogReason] = useState<AuthReason>("nudge");
  const [dialogDismissible, setDialogDismissible] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate from sessionStorage on mount.
  useEffect(() => {
    setState(loadGuestState());
    setHydrated(true);
  }, []);

  // Persist on change.
  useEffect(() => {
    if (hydrated) saveGuestState(state);
  }, [state, hydrated]);

  // Refresh wipes the conversation: clear sessionStorage when the user
  // navigates away / reloads. (sessionStorage already dies on full close;
  // we additionally clear on unload to handle in-page reload.)
  useEffect(() => {
    const onUnload = () => {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // Auto scroll on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [state.messages.length, sending]);

  // After a Google-OAuth round-trip we may land here already signed in
  // with a pending claim flag. Detect, run the claim, and navigate.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      const pending = sessionStorage.getItem(CLAIM_PENDING_KEY);
      if (!pending) return;
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) return;
      try {
        await runClaim();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function openDialog(reason: AuthReason, dismissible: boolean) {
    setDialogReason(reason);
    setDialogDismissible(dismissible);
    setDialogOpen(true);
    setState((s) => ({ ...s, lastNudgeAt: s.exchangeCount }));
  }

  async function runClaim() {
    const s = loadGuestState();
    const res = (await claim({
      data: {
        title: s.draftJob?.title || s.messages[0]?.content?.slice(0, 60),
        messages: s.messages.map((m) => ({
          role: m.role,
          content: m.content,
          tool_calls: m.tool_calls ?? null,
        })),
        draftJob: s.draftJob,
      },
    })) as { conversationId: string };
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(CLAIM_PENDING_KEY);
    setDialogOpen(false);
    navigate({ to: "/app/c/$id", params: { id: res.conversationId } });
  }

  async function send(content: string, opts?: { hidden?: boolean }) {
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    const userMsg: GuestMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const draft = state.draftJob;
    const prior = state.messages;
    const next: GuestState = {
      ...state,
      messages: opts?.hidden ? prior : [...prior, userMsg],
    };
    setState(next);
    setSending(true);

    try {
      const res = await fetch("/api/public/guest-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          guestId: next.guestId,
          messages: [...next.messages, ...(opts?.hidden ? [userMsg] : [])].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          draftJob: draft,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Request failed");
      }
      const payload = (await res.json()) as {
        assistant: string;
        toolEvents: Array<{ kind: string; data: unknown }>;
        draftJob?: DraftJob;
        signupRequired?: boolean;
        signupReason?: string;
      };

      const assistantId = `a-${Date.now()}`;
      const assistantMsg: GuestMessage = {
        id: assistantId,
        role: "assistant",
        content: payload.assistant,
      };

      const clarifyEvents = payload.toolEvents.filter((e) => e.kind === "clarify");
      const newClarifies: GuestClarify[] = clarifyEvents.map((e, i) => ({
        taskId: `c-${Date.now()}-${i}`,
        data: e.data as ClarifyData,
        afterMessageId: assistantId,
      }));

      const exchange = next.exchangeCount + 1;
      const requireSignup =
        Boolean(payload.signupRequired) ||
        payload.toolEvents.some((e) => e.kind === "request_signup");

      const updated: GuestState = {
        ...next,
        messages: [...next.messages, assistantMsg],
        clarifies: [...next.clarifies, ...newClarifies],
        draftJob: payload.draftJob ?? next.draftJob,
        exchangeCount: exchange,
        signupRequired: requireSignup || next.signupRequired,
        signupReason: requireSignup
          ? (payload.signupReason as AuthReason | undefined) || "sourcing"
          : next.signupReason,
      };
      setState(updated);

      // Nudge cadence: open dialog after every 3rd–4th exchange unless
      // we already opened it recently.
      if (requireSignup) {
        openDialog("sourcing", false);
      } else if (exchange >= 3 && exchange - updated.lastNudgeAt >= 4) {
        openDialog("nudge", true);
      } else if (exchange === 3 && updated.lastNudgeAt < 0) {
        openDialog("nudge", true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setState((s) => ({
        ...s,
        messages: [
          ...s.messages,
          { id: `e-${Date.now()}`, role: "assistant", content: `_${message}_` },
        ],
      }));
    } finally {
      setSending(false);
    }
  }

  function answerClarify(taskId: string, formatted: string, answers: Record<string, string[]>) {
    setState((s) => ({
      ...s,
      clarifies: s.clarifies.map((c) =>
        c.taskId === taskId ? { ...c, answered: true, answers } : c,
      ),
    }));
    void send(formatted);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    const t = text;
    setText("");
    void send(t);
  }

  const empty = state.messages.length === 0 && !sending;

  const suggestions = [
    "Senior backend engineer, Berlin, Go + Postgres",
    "Product designer, remote EU, fintech",
    "Sales lead, NYC, SaaS",
  ];

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      {/* Top bar */}
      <header className="flex h-14 items-center justify-between border-b border-border px-5">
        <div className="flex items-center gap-2">
          <Wordmark height={36} />
          <span className="ml-2 rounded-full border border-border bg-bg-elev px-2 py-0.5 text-[10.5px] uppercase tracking-[0.06em] text-text-mute">
            Guest preview
          </span>
        </div>
        <div className="flex items-center gap-2">
          {state.messages.length > 0 && (
            <button
              type="button"
              onClick={() => openDialog("manual", true)}
              className="rounded-full border border-border bg-bg-elev px-3 py-1.5 text-[12.5px] text-text-mute transition hover:bg-bg-hover hover:text-text"
            >
              Save this chat
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setDialogReason("manual");
              setDialogDismissible(true);
              setDialogOpen(true);
            }}
            className="rounded-full bg-text px-3 py-1.5 text-[12.5px] font-medium text-text-invert hover:opacity-90"
          >
            Sign in
          </button>
        </div>
      </header>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="w-full max-w-[640px] text-center">
            <AppIcon size={48} className="mx-auto mb-5" />
            <h1 className="text-[28px] font-semibold tracking-tight text-text">
              What hire can I help with?
            </h1>
            <p className="mt-2 text-[13.5px] text-text-mute">
              Describe the role. I'll ask the right questions and draft a Job. Sign up when you're ready to find candidates.
            </p>

            <form onSubmit={onSubmit} className="mt-7">
              <Composer text={text} setText={setText} sending={sending} onSubmit={onSubmit} />
            </form>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-border bg-bg px-3 py-1.5 text-[12px] text-text-mute transition hover:bg-bg-hover hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[760px] space-y-6 px-4 py-10">
              {state.messages.map((m) => {
                const isUser = m.role === "user";
                const clarifies = state.clarifies.filter((c) => c.afterMessageId === m.id);
                return (
                  <div key={m.id} className="space-y-4">
                    {isUser ? (
                      <div className="fade-up flex justify-end">
                        <div className="max-w-[78%] rounded-2xl bg-bg-bubble px-4 py-2.5 text-[14px]">
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                      </div>
                    ) : (
                      <AssistantRow content={m.content} />
                    )}
                    {clarifies.map((c) => (
                      <TimelineRow key={c.taskId}>
                        <ClarifyCard
                          data={c.data}
                          answered={c.answered}
                          answers={c.answers}
                          onSubmit={(formatted, answers) =>
                            answerClarify(c.taskId, formatted, answers)
                          }
                        />
                      </TimelineRow>
                    ))}
                  </div>
                );
              })}
              {state.draftJob && (state.draftJob.title || state.draftJob.description) && (
                <TimelineRow>
                  <DraftJobCard
                    draft={state.draftJob}
                    onSignup={() => openDialog("sourcing", false)}
                  />
                </TimelineRow>
              )}
              {sending && (
                <TimelineRow pulse>
                  <span className="text-[13px] text-text-mute">Thinking…</span>
                </TimelineRow>
              )}
            </div>
          </div>
          <form onSubmit={onSubmit} className="border-t border-border bg-bg px-4 py-3">
            <div className="mx-auto max-w-[760px]">
              <Composer text={text} setText={setText} sending={sending} onSubmit={onSubmit} />
              {state.signupRequired && (
                <div className="mt-2 text-center text-[12px] text-text-mute">
                  Sourcing, posts, and interviews are part of the free account.{" "}
                  <button
                    type="button"
                    onClick={() => openDialog("sourcing", false)}
                    className="font-medium text-text underline"
                  >
                    Create an account
                  </button>{" "}
                  to keep this conversation.
                </div>
              )}
            </div>
          </form>
        </div>
      )}

      <AuthDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reason={dialogReason}
        dismissible={dialogDismissible}
        onAuthenticated={async () => {
          await runClaim();
        }}
      />
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-bg px-5 py-4">
      <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12px] text-text-faint">
        <Wordmark height={18} />
        <span aria-hidden>·</span>
        <Link to="/privacy" className="transition hover:text-text-mute">
          Privacy
        </Link>
        <Link to="/terms" className="transition hover:text-text-mute">
          Terms
        </Link>
        <span aria-hidden>·</span>
        <a href="mailto:support@findable.work" className="transition hover:text-text-mute">
          Contact
        </a>
        <span aria-hidden>·</span>
        <span>© 2026 Virgilio Technologies LLC</span>
      </div>
    </footer>
  );
}

function Composer({
  text,
  setText,
  sending,
  onSubmit,
}: {
  text: string;
  setText: (v: string) => void;
  sending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-bg-elev p-2.5 shadow-[var(--shadow-sm)] focus-within:border-border-strong">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Message findable…"
        rows={1}
        className="min-h-[28px] w-full resize-none bg-transparent px-2 py-1 text-[14px] outline-none placeholder:text-text-faint"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit(e as unknown as React.FormEvent);
          }
        }}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1 rounded-full border border-border bg-bg px-2.5 py-1 text-[12px] text-text-mute">
            <Sparkle size={12} /> Hiring mode
          </span>
        </div>
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-text text-text-invert transition hover:opacity-90 disabled:opacity-30"
        >
          <SendIcon size={14} />
        </button>
      </div>
    </div>
  );
}

function TimelineRow({
  children,
  pulse,
}: {
  children: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="fade-up flex items-start gap-3">
      <span
        className={cn(
          "mt-1 flex h-5 w-5 shrink-0 items-center justify-center text-text-faint",
          pulse && "animate-pulse",
        )}
      >
        <ChatGlyph size={14} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function AssistantRow({ content }: { content: string }) {
  return (
    <TimelineRow>
      <div className="prose prose-sm max-w-none text-[14px] text-text dark:prose-invert prose-p:my-2 prose-headings:mb-2 prose-headings:mt-4 prose-code:text-text">
        <ReactMarkdown>{content || "…"}</ReactMarkdown>
      </div>
    </TimelineRow>
  );
}

function DraftJobCard({
  draft,
  onSignup,
}: {
  draft: DraftJob;
  onSignup: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-elev p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-bubble text-text-mute">
          <Briefcase size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-text">
            {draft.title || "Draft job"}
          </div>
          {draft.location && (
            <div className="text-[12px] text-text-mute">{draft.location}</div>
          )}
          {draft.description && (
            <div className="mt-2 line-clamp-4 whitespace-pre-wrap text-[12.5px] text-text-mute">
              {draft.description}
            </div>
          )}
          {draft.requirements && draft.requirements.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-[12.5px] text-text-mute">
              {draft.requirements.slice(0, 5).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-[11.5px] uppercase tracking-[0.06em] text-text-faint">
          Preview · not yet saved
        </span>
        <button
          type="button"
          onClick={onSignup}
          className="rounded-full bg-text px-3 py-1 text-[12px] font-medium text-text-invert hover:opacity-90"
        >
          Sign up to edit & source
        </button>
      </div>
    </div>
  );
}
