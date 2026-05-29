import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Markdown } from "@/components/ui/markdown";
import { getConversation } from "@/lib/conversations.functions";
import {
  updateJob,
  duplicateJob,
  publishJob,
  unpublishJob,
  regenerateScreening,
} from "@/lib/jobs.functions";
import { listApplications } from "@/lib/applications.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Logo,
  AppIcon,
  ChatGlyph,
  Chat as ChatIcon,
  Briefcase,
  Megaphone,
  Send as SendIcon,
  Attach,
  Sparkle,
  Dots,
  Users,
  Copy,
  Pencil,
  Upload,
  Check,
  Search as SearchIcon,
} from "@/components/findable-icons";
import { cn } from "@/lib/utils";
import { CandidatesPanel } from "@/components/candidates/candidates-panel";
import { TaskCard, type ChatTask, type ArtifactTab } from "@/components/chat/task-card";
import { ThinkingTicker } from "@/components/chat/thinking-ticker";
import { JobPostsPanel, type JobPost } from "@/components/job-posts/job-posts-panel";
import { OutreachPanel } from "@/components/outreach/outreach-panel";

// Splits an assistant message into segments rendered before and after the
// associated task cards. Must stay in sync with the constant in
// src/routes/api/chat.ts.
const AFTER_TASKS_MARKER = "\n\n<<<AFTER_TASKS>>>\n\n";

function splitAroundTasks(content: string): { before: string; after: string } {
  const idx = content.indexOf(AFTER_TASKS_MARKER);
  if (idx === -1) return { before: content, after: "" };
  return {
    before: content.slice(0, idx),
    after: content.slice(idx + AFTER_TASKS_MARKER.length),
  };
}

export const Route = createFileRoute("/_authenticated/app/c/$id")({
  component: ConversationPage,
});

type Message = { id: string; role: string; content: string; created_at: string };
type Job = {
  id: string;
  conversation_id: string;
  title: string;
  description: string;
  requirements: string[];
  location: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  status: string;
  slug?: string | null;
  published?: boolean;
  published_at?: string | null;
  company?: string;
  screening?: Array<{
    id: string;
    type: "select" | "multi" | "textarea";
    question: string;
    options?: string[];
    required: boolean;
  }>;
};

function ConversationPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getConversation);
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => get({ data: { id } }),
  });

  const [streaming, setStreaming] = useState<string>("");
  const [reasoning, setReasoning] = useState<string>("");
  const [streamStart, setStreamStart] = useState<number>(0);
  const [streamEnd, setStreamEnd] = useState<number>(0);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"chat" | "job" | "job_posts" | "candidates" | "outreach">("chat");
  const [pulse, setPulse] = useState(false);
  const [jobPostsPulse, setJobPostsPulse] = useState(false);
  const [candidatesPulse, setCandidatesPulse] = useState(false);
  const [outreachPulse, setOutreachPulse] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [liveTasks, setLiveTasks] = useState<ChatTask[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, Record<string, string[]>>>({});

  const messages: Message[] = data?.messages ?? [];
  const job: Job | null = (data?.job as Job | null) ?? null;
  const jobPost: JobPost | null = (data?.jobPost as JobPost | null) ?? null;
  const outreach = (data as any)?.outreach ?? null;
  const title: string = data?.conversation?.title ?? "Untitled project";
  const persistedTasks: ChatTask[] = (data?.tasks as ChatTask[] | undefined) ?? [];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-text-faint">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
    );
  }
  if (!data) throw notFound();

  async function sendMessage(text: string) {
    setSending(true);
    setStreaming("");
    setReasoning("");
    setStreamStart(Date.now());
    setStreamEnd(0);
    setLiveTasks([]);
    qc.setQueryData(["conversation", id], (prev: any) => ({
      ...prev,
      messages: [
        ...(prev?.messages ?? []),
        { id: `tmp-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString() },
      ],
    }));

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ conversationId: id, message: text }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setStreaming("");
        alert(err.error ?? "Request failed");
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      let jobCreated = false;
      let jobPostCreated = false;
      let outreachCreated = false;
      let candidatesAdded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          const lines = chunk.split("\n");
          let event = "message";
          let dataLine = "";
          for (const l of lines) {
            if (l.startsWith("event: ")) event = l.slice(7).trim();
            else if (l.startsWith("data: ")) dataLine += l.slice(6);
          }
          if (!dataLine) continue;
          let payload: any;
          try {
            payload = JSON.parse(dataLine);
          } catch {
            continue;
          }
          if (event === "delta" && payload.content) {
            acc += payload.content;
            setStreaming(acc);
          } else if (event === "text_replace" && typeof payload.content === "string") {
            acc = payload.content;
            setStreaming(acc);
          } else if (event === "reasoning" && typeof payload.content === "string") {
            setReasoning((prev) => prev + payload.content);
          } else if (event === "job") {
            jobCreated = true;
          } else if (event === "job_posts") {
            jobPostCreated = true;
          } else if (event === "outreach") {
            outreachCreated = true;
          } else if (event === "task") {
            const t = payload as ChatTask;
            setLiveTasks((prev) => {
              const idx = prev.findIndex((x) => x.id === t.id);
              if (idx === -1) return [...prev, t];
              const next = [...prev];
              next[idx] = t;
              return next;
            });
          } else if (event === "candidates_added") {
            candidatesAdded += payload.count ?? 0;
          } else if (event === "error") {
            alert(payload.message ?? "Stream error");
          }
        }
      }

      setStreamEnd(Date.now());
      setStreaming("");
      setLiveTasks([]);
      // Keep `reasoning` so the collapsed "Thought for Ns" chip stays
      // visible on the last turn until the user sends the next message.
      await qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      if (candidatesAdded > 0) {
        qc.invalidateQueries({ queryKey: ["candidates", id] });
        if (tab !== "candidates") {
          setCandidatesPulse(true);
          setTimeout(() => setCandidatesPulse(false), 3500);
        }
      }
      if (jobCreated) {
        setPulse(true);
        setTimeout(() => setPulse(false), 3500);
      }
      if (jobPostCreated && tab !== "job_posts") {
        setJobPostsPulse(true);
        setTimeout(() => setJobPostsPulse(false), 3500);
      }
      if (outreachCreated && tab !== "outreach") {
        setOutreachPulse(true);
        setTimeout(() => setOutreachPulse(false), 3500);
      }
    } finally {
      setSending(false);
    }
  }

  function askFindable(prompt: string) {
    setTab("chat");
    setComposerText((prev) => (prev ? prev + "\n\n" + prompt : prompt));
  }

  return (
    <div className="flex h-full flex-col">
      {/* Browser-style tab bar */}
      <div
        className="flex items-center justify-between border-b border-border bg-bg-side px-3"
        style={{ height: "var(--tabbar-h)" }}
      >
        <div className="flex items-end gap-1">
          <TabButton
            active={tab === "chat"}
            onClick={() => setTab("chat")}
            icon={<ChatIcon size={14} />}
            label="Chat"
          />
          {job && (
            <TabButton
              active={tab === "job"}
              onClick={() => setTab("job")}
              icon={<Briefcase size={14} />}
              label="Job"
              pulse={pulse && tab !== "job"}
            />
          )}
          {jobPost && (
            <TabButton
              active={tab === "job_posts"}
              onClick={() => setTab("job_posts")}
              icon={<Megaphone size={14} />}
              label="Job Posts"
              pulse={jobPostsPulse && tab !== "job_posts"}
            />
          )}
          {job && (
            <TabButton
              active={tab === "candidates"}
              onClick={() => setTab("candidates")}
              icon={<Users size={14} />}
              label="Candidates"
              pulse={candidatesPulse && tab !== "candidates"}
            />
          )}
          {outreach && (
            <TabButton
              active={tab === "outreach"}
              onClick={() => setTab("outreach")}
              icon={<SendIcon size={14} />}
              label="Outreach"
              pulse={outreachPulse && tab !== "outreach"}
            />
          )}
        </div>
        <div className="flex items-center gap-3 pr-1">
          <span className="max-w-[280px] truncate text-[12.5px] font-medium text-text">{title}</span>
          <button
            aria-label="Share"
            className="rounded-md px-2 py-1 text-[12px] text-text-mute transition hover:bg-bg-hover hover:text-text"
          >
            Share
          </button>
          <button
            aria-label="More"
            className="rounded-md p-1.5 text-text-mute transition hover:bg-bg-hover hover:text-text"
          >
            <Dots size={14} />
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {tab === "chat" ? (
          <ChatPanel
            messages={messages}
            streaming={streaming}
            reasoning={reasoning}
            streamStart={streamStart}
            streamEnd={streamEnd}
            sending={sending}
            onSend={sendMessage}
            text={composerText}
            setText={setComposerText}
            persistedTasks={persistedTasks}
            liveTasks={liveTasks}
            onOpenTab={(t) => setTab(t)}
            clarifyAnswers={clarifyAnswers}
            onSubmitClarify={(taskId, formatted, answers) => {
              setClarifyAnswers((prev) => ({ ...prev, [taskId]: answers }));
              sendMessage(formatted);
            }}
          />
        ) : tab === "job" && job ? (
          <div className="flex-1 overflow-y-auto">
            <JobPanel
              job={job}
              conversationId={id}
              onAskRevise={() =>
                askFindable(
                  `Please revise this job. Specifically: `,
                )
              }
              onDuplicated={(newId) => {
                router.navigate({ to: "/app/c/$id", params: { id: newId } });
              }}
            />
          </div>
        ) : tab === "job_posts" && jobPost ? (
          <div className="flex-1 overflow-y-auto">
            <JobPostsPanel jobPost={jobPost} conversationId={id} />
          </div>
        ) : tab === "candidates" && job ? (
          <CandidatesPanel conversationId={id} onAskFindable={askFindable} />
        ) : tab === "outreach" ? (
          <OutreachPanel conversationId={id} />
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  pulse,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  pulse?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative -mb-px flex items-center gap-1.5 rounded-t-[8px] border border-transparent px-3 py-1.5 text-[12.5px] transition",
        active
          ? "border-border border-b-bg bg-bg text-text"
          : "text-text-mute hover:bg-bg-hover hover:text-text",
        pulse && "tab-pulse",
      )}
      style={{ marginBottom: "-1px" }}
    >
      <span className="opacity-80">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function ChatPanel({
  messages,
  streaming,
  sending,
  onSend,
  text,
  setText,
  persistedTasks,
  liveTasks,
  onOpenTab,
  clarifyAnswers,
  onSubmitClarify,
}: {
  messages: Message[];
  streaming: string;
  sending: boolean;
  onSend: (text: string) => void;
  text: string;
  setText: (v: string) => void;
  persistedTasks: ChatTask[];
  liveTasks: ChatTask[];
  onOpenTab: (t: ArtifactTab) => void;
  clarifyAnswers: Record<string, Record<string, string[]>>;
  onSubmitClarify: (taskId: string, formatted: string, answers: Record<string, string[]>) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, streaming]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setText("");
    onSend(t);
  }

  const empty = messages.length === 0 && !streaming;

  const suggestions = [
    "Senior backend engineer, Berlin, Go + Postgres",
    "Product designer, remote EU, fintech",
    "Sales lead, NYC, SaaS",
  ];

  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-[640px] text-center">
          <AppIcon size={48} className="mx-auto mb-5" />
          <h1 className="text-[24px] font-semibold tracking-tight text-text">
            What hire can I help with?
          </h1>
          <p className="mt-2 text-[13px] text-text-mute">
            Describe the role. I'll ask the right questions, then draft a Job in a new tab.
          </p>

          <form onSubmit={submit} className="mt-7">
            <Composer text={text} setText={setText} sending={sending} onSubmit={submit} />
          </form>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSend(s)}
                className="rounded-full border border-border bg-bg px-3 py-1.5 text-[12px] text-text-mute transition hover:bg-bg-hover hover:text-text"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] space-y-6 px-4 py-10">
          {messages.map((m) => {
            const msgTasks = persistedTasks.filter((t) => t.message_id === m.id);
            const { before, after } =
              m.role === "assistant"
                ? splitAroundTasks(m.content)
                : { before: m.content, after: "" };
            return (
              <div key={m.id} className="space-y-4">
                {before && <MessageRow role={m.role} content={before} />}
                {msgTasks.length > 0 && m.role === "assistant" &&
                  msgTasks.map((t) => (
                    <TimelineRow key={t.id}>
                      <TaskCard
                        task={t}
                        onOpenTab={onOpenTab}
                        onSubmitClarify={onSubmitClarify}
                        clarifyAnswered={Boolean(clarifyAnswers[t.id])}
                        clarifyAnswers={clarifyAnswers[t.id]}
                      />
                    </TimelineRow>
                  ))}
                {after && m.role === "assistant" && (
                  <MessageRow role={m.role} content={after} />
                )}
              </div>
            );
          })}
          {(streaming || liveTasks.length > 0) && (
            <div className="space-y-4">
              {(() => {
                const { before, after } = splitAroundTasks(streaming);
                return (
                  <>
                    {before && <MessageRow role="assistant" content={before} streaming />}
                    {liveTasks.map((t) => (
                      <TimelineRow key={t.id}>
                        <TaskCard
                          task={t}
                          onOpenTab={onOpenTab}
                          onSubmitClarify={onSubmitClarify}
                          clarifyAnswered={Boolean(clarifyAnswers[t.id])}
                          clarifyAnswers={clarifyAnswers[t.id]}
                        />
                      </TimelineRow>
                    ))}
                    {after && <MessageRow role="assistant" content={after} streaming />}
                  </>
                );
              })()}
            </div>
          )}
          {sending && !streaming && liveTasks.length === 0 && (
            <TimelineRow pulse>
              <span className="text-[13px] text-text-mute">Thinking…</span>
            </TimelineRow>
          )}
        </div>
      </div>
      <form onSubmit={submit} className="border-t border-border bg-bg px-4 py-3">
        <div className="mx-auto max-w-[760px]">
          <Composer text={text} setText={setText} sending={sending} onSubmit={submit} />
        </div>
      </form>
    </div>
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
            onSubmit(e as any);
          }
        }}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-mute transition hover:bg-bg-hover hover:text-text"
          >
            <Attach size={14} /> Attach
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-full border border-border bg-bg px-2.5 py-1 text-[12px] text-text-mute transition hover:bg-bg-hover hover:text-text"
          >
            <Sparkle size={12} /> Hiring mode
          </button>
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

function MessageRow({
  role,
  content,
  streaming,
}: {
  role: string;
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  if (isUser) {
    return (
      <div className="fade-up flex justify-end">
        <div className="max-w-[78%] rounded-2xl bg-bg-bubble px-4 py-2.5 text-[14px] text-text">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }
  return (
    <TimelineRow pulse={streaming && !content}>
      <div className="prose prose-sm max-w-none text-[14px] text-text dark:prose-invert leading-7 prose-p:my-3 prose-p:leading-7 prose-headings:mt-5 prose-headings:mb-2 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:marker:text-text-faint prose-strong:text-text prose-code:text-text prose-code:bg-bg-bubble prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-bg-bubble prose-pre:text-text prose-pre:rounded-lg prose-pre:p-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "…"}</ReactMarkdown>
        {streaming && content && <span className="caret" />}
      </div>
    </TimelineRow>
  );
}

function JobPanel({
  job,
  conversationId,
  onAskRevise,
  onDuplicated,
}: {
  job: Job;
  conversationId: string;
  onAskRevise: () => void;
  onDuplicated: (newId: string) => void;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateJob);
  const dupe = useServerFn(duplicateJob);
  const pub = useServerFn(publishJob);
  const unpub = useServerFn(unpublishJob);
  const regen = useServerFn(regenerateScreening);
  const listApps = useServerFn(listApplications);
  const [form, setForm] = useState<Job>(job);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<boolean>(!job.description);
  const [duplicating, setDuplicating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusMenu, setStatusMenu] = useState(false);

  const { data: applications } = useQuery({
    queryKey: ["applications", conversationId],
    queryFn: () => listApps({ data: { conversationId } }),
    enabled: Boolean(form.published),
    refetchInterval: 15000,
  });
  const applicantCount = (applications ?? []).length;

  const publicUrl =
    form.slug && typeof window !== "undefined"
      ? `${window.location.origin}/jobs/${form.slug}`
      : "";

  useEffect(() => setForm(job), [job.id]);
  // Resync server-managed fields when the conversation query refetches
  // (publish/unpublish updates published/slug/status without changing id).
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      published: job.published,
      published_at: job.published_at,
      slug: job.slug,
      status: job.status,
    }));
  }, [job.published, job.published_at, job.slug, job.status]);

  async function save(patch: Partial<Job>) {
    setSaving(true);
    try {
      const next = { ...form, ...patch };
      setForm(next);
      await update({
        data: {
          conversationId,
          title: next.title,
          description: next.description,
          requirements: next.requirements,
          location: next.location,
          employment_type: next.employment_type as any,
          salary_min: next.salary_min,
          salary_max: next.salary_max,
          currency: next.currency,
          status: next.status as any,
        },
      });
      setSavedAt(new Date().toLocaleTimeString());
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
    } finally {
      setSaving(false);
    }
  }

  const reqText = useMemo(() => form.requirements.join("\n"), [form.requirements]);
  const published = Boolean(form.published);
  const statusLabel = published ? "Live" : "Draft";

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const res = await dupe({ data: { conversationId } });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast("Job duplicated");
      onDuplicated((res as { conversationId: string }).conversationId);
    } catch (e) {
      toast.error("Could not duplicate job");
    } finally {
      setDuplicating(false);
    }
  }

  async function handlePublish() {
    if (published) return;
    setPublishing(true);
    try {
      await pub({ data: { conversationId } });
      await qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      toast.success("Job is now live");
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    setPublishing(true);
    try {
      await unpub({ data: { conversationId } });
      await qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      toast("Job unpublished");
    } finally {
      setPublishing(false);
      setStatusMenu(false);
    }
  }

  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
    setStatusMenu(false);
  }

  async function handleRegenScreening() {
    try {
      await regen({ data: { conversationId } });
      await qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      toast.success("Screening questions regenerated");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't regenerate questions");
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-8 py-7">
      {/* Sub-header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-bg-bubble text-text">
            <Briefcase size={18} />
          </div>
          <div>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onBlur={(e) => e.target.value !== job.title && save({ title: e.target.value })}
              className="bg-transparent text-[18px] font-semibold tracking-tight text-text outline-none focus:border-b focus:border-border-strong"
            />
            <p className="text-[12px] text-text-mute">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    published ? "bg-emerald-500" : "bg-text-faint",
                  )}
                />
                {statusLabel}
              </span>
              {published && applicantCount > 0 && (
                <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-bg-bubble px-2 py-0.5 text-[11px] font-medium text-text">
                  {applicantCount} applicant{applicantCount === 1 ? "" : "s"}
                </span>
              )}
              {form.location && <span className="ml-3">{form.location}</span>}
              <span className="ml-3 text-text-faint">
                {saving ? "Saving…" : savedAt ? `Saved ${savedAt}` : "Edits autosave"}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <HeaderBtn onClick={handleDuplicate} disabled={duplicating} icon={<Copy size={13} />} label="Duplicate" />
          <HeaderBtn
            onClick={() => setEditing((v) => !v)}
            icon={<Pencil size={13} />}
            label={editing ? "Done" : "Edit"}
            active={editing}
          />
          {published ? (
            <div className="relative">
              <HeaderBtn
                onClick={() => setStatusMenu((v) => !v)}
                icon={<Check size={13} />}
                label="Live"
                dot
              />
              {statusMenu && (
                <div className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[180px] rounded-lg border border-border-strong bg-bg-elev p-1 shadow-[var(--shadow-md)]">
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setStatusMenu(false)}
                    className="block rounded-md px-2.5 py-1.5 text-left text-[13px] text-text hover:bg-bg-hover"
                  >
                    View public page
                  </a>
                  <button
                    onClick={copyLink}
                    className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-text hover:bg-bg-hover"
                  >
                    Copy link
                  </button>
                  <button
                    onClick={handleUnpublish}
                    disabled={publishing}
                    className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-text hover:bg-bg-hover disabled:opacity-50"
                  >
                    Unpublish
                  </button>
                </div>
              )}
            </div>
          ) : (
            <HeaderBtn
              onClick={handlePublish}
              disabled={publishing}
              icon={<Upload size={13} />}
              label={publishing ? "Publishing…" : "Publish"}
              primary
            />
          )}
        </div>
      </div>

      {published && publicUrl && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[12px] border border-border bg-bg-side px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-[12.5px]">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-text-mute">Public application page:</span>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-mono text-text underline decoration-border-strong underline-offset-2"
            >
              {publicUrl}
            </a>
          </div>
          <button
            onClick={copyLink}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 text-[12px] text-text-mute hover:bg-bg-hover hover:text-text"
          >
            <Copy size={12} /> Copy
          </button>
        </div>
      )}

      {/* Two columns */}
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="space-y-7">
          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Summary
            </h3>
            {editing ? (
              <Textarea
                rows={6}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                onBlur={(e) => e.target.value !== job.description && save({ description: e.target.value })}
                className="border-border bg-bg-elev text-[14px] leading-relaxed"
              />
            ) : (
              form.description ? (
                <Markdown className="text-[14px]">{form.description}</Markdown>
              ) : (
                <div className="text-[14px] leading-relaxed text-text-faint">No summary yet.</div>
              )
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Requirements
            </h3>
            {editing ? (
              <Textarea
                rows={8}
                value={reqText}
                onChange={(e) =>
                  setForm({ ...form, requirements: e.target.value.split("\n").filter(Boolean) })
                }
                onBlur={(e) => {
                  const next = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                  if (JSON.stringify(next) !== JSON.stringify(job.requirements)) {
                    save({ requirements: next });
                  }
                }}
                placeholder="One per line"
                className="border-border bg-bg-elev text-[14px] leading-relaxed"
              />
            ) : form.requirements.length ? (
              <ul className="list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-text">
                {form.requirements.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : (
              <span className="text-[14px] text-text-faint">No requirements yet.</span>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-text-faint">
                Application questions
              </h3>
              <button
                onClick={handleRegenScreening}
                className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 text-[11.5px] text-text-mute transition hover:bg-bg-hover hover:text-text"
              >
                <Sparkle size={11} /> Regenerate
              </button>
            </div>
            {form.screening && form.screening.length > 0 ? (
              <ol className="space-y-2.5">
                {form.screening.map((q, i) => (
                  <li
                    key={q.id}
                    className="rounded-[10px] border border-border bg-bg-elev p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 font-mono text-[11px] text-text-faint">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1">
                        <div className="text-[13px] text-text">{q.question}</div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-text-faint">
                          <span className="rounded bg-bg-input px-1.5 py-0.5 font-mono">
                            {q.type}
                          </span>
                          {q.required && <span>required</span>}
                          {q.options && q.options.length > 0 && (
                            <span className="truncate">
                              {q.options.join(" · ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="rounded-[10px] border border-dashed border-border bg-bg-elev p-4 text-center text-[12.5px] text-text-mute">
                {published
                  ? "No screening questions yet. Click Regenerate to draft them."
                  : "Publish this job to auto-generate screening questions for applicants."}
              </div>
            )}
          </section>
        </div>

        {/* Side */}
        <aside className="space-y-4">
          <div className="rounded-[14px] border border-border bg-bg-elev p-4">
            <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Details
            </h3>
            <div className="space-y-3">
              <Field label="Location">
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  onBlur={(e) => e.target.value !== job.location && save({ location: e.target.value })}
                  className="h-8 border-border bg-bg"
                />
              </Field>
              <Field label="Employment">
                <Select
                  value={form.employment_type}
                  onValueChange={(v) => save({ employment_type: v })}
                >
                  <SelectTrigger className="h-8 border-border bg-bg text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full-time</SelectItem>
                    <SelectItem value="part_time">Part-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="internship">Internship</SelectItem>
                    <SelectItem value="temporary">Temporary</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Salary min">
                  <Input
                    type="number"
                    value={form.salary_min ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        salary_min: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    onBlur={() => save({ salary_min: form.salary_min })}
                    className="h-8 border-border bg-bg"
                  />
                </Field>
                <Field label="Salary max">
                  <Input
                    type="number"
                    value={form.salary_max ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        salary_max: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    onBlur={() => save({ salary_max: form.salary_max })}
                    className="h-8 border-border bg-bg"
                  />
                </Field>
              </div>
              <Field label="Currency">
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  onBlur={(e) => e.target.value !== job.currency && save({ currency: e.target.value })}
                  className="h-8 border-border bg-bg"
                />
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => save({ status: v })}>
                  <SelectTrigger className="h-8 border-border bg-bg text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          <div className="rounded-[14px] border border-border bg-bg-side p-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-text-faint">
              <Sparkle size={12} /> Suggested by findable
            </div>
            <p className="text-[12.5px] leading-relaxed text-text-mute">
              Once you fill in the summary and requirements, I can suggest a salary band, a sourcing
              plan, and an interview loop.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onAskRevise}
              className="mt-3 h-8 w-full border-border bg-bg text-[12.5px]"
            >
              Ask findable to revise
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-text-mute">{label}</Label>
      {children}
    </div>
  );
}

function HeaderBtn({
  onClick,
  disabled,
  icon,
  label,
  primary,
  active,
  dot,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  active?: boolean;
  dot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition disabled:opacity-60",
        primary
          ? "border-transparent bg-text text-text-invert hover:opacity-90"
          : active
            ? "border-border-strong bg-bg-bubble text-text"
            : "border-border bg-bg text-text-mute hover:bg-bg-hover hover:text-text",
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      {icon}
      <span>{label}</span>
    </button>
  );
}
