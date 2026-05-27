import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { getConversation } from "@/lib/conversations.functions";
import { updateJob } from "@/lib/jobs.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Send, Briefcase, MessageSquare, Loader2 } from "lucide-react";

export const Route = createFileRoute("/app/c/$id")({
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
};

function ConversationPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getConversation);

  const { data, isLoading } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => get({ data: { id } }),
  });

  const [streaming, setStreaming] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"chat" | "job">("chat");

  const messages: Message[] = data?.messages ?? [];
  const job: Job | null = (data?.job as Job | null) ?? null;

  useEffect(() => {
    if (job && tab === "chat" && messages.length > 0 && !streaming) {
      // Auto-switch to Job tab the first time it appears
    }
  }, [job, tab, messages.length, streaming]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) throw notFound();

  async function sendMessage(text: string) {
    setSending(true);
    setStreaming("");
    // optimistic
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
          } else if (event === "job") {
            jobCreated = true;
          } else if (event === "error") {
            alert(payload.message ?? "Stream error");
          }
        }
      }

      setStreaming("");
      await qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      if (jobCreated) setTab("job");
    } finally {
      setSending(false);
    }
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "chat" | "job")} className="flex h-full flex-col">
      <div className="border-b px-4">
        <TabsList className="h-11 bg-transparent p-0">
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare className="h-4 w-4" /> Chat
          </TabsTrigger>
          {job && (
            <TabsTrigger value="job" className="gap-1.5">
              <Briefcase className="h-4 w-4" /> Job
            </TabsTrigger>
          )}
        </TabsList>
      </div>
      <TabsContent value="chat" className="m-0 flex flex-1 flex-col overflow-hidden">
        <ChatPanel messages={messages} streaming={streaming} sending={sending} onSend={sendMessage} />
      </TabsContent>
      {job && (
        <TabsContent value="job" className="m-0 flex-1 overflow-y-auto">
          <JobPanel job={job} conversationId={id} />
        </TabsContent>
      )}
    </Tabs>
  );
}

function ChatPanel({
  messages,
  streaming,
  sending,
  onSend,
}: {
  messages: Message[];
  streaming: string;
  sending: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          {empty && (
            <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Describe the role you're hiring for.</p>
              <p className="mt-1">
                e.g. <em>"I need a senior backend engineer in Berlin, Go + Postgres, €90–110k."</em>
                {" "}The AI will ask follow-ups, then draft a Job in a new tab.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}
          {streaming && <MessageBubble role="assistant" content={streaming} />}
          {sending && !streaming && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          )}
        </div>
      </div>
      <form onSubmit={submit} className="border-t bg-background p-3">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the recruiting agent…"
            rows={1}
            className="min-h-[44px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e as any);
              }
            }}
          />
          <Button type="submit" disabled={sending || !text.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : ""}>
      <div
        className={
          isUser
            ? "max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground"
            : "max-w-[90%] text-sm"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-headings:mb-2 prose-headings:mt-4">
            <ReactMarkdown>{content || "…"}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function JobPanel({ job, conversationId }: { job: Job; conversationId: string }) {
  const qc = useQueryClient();
  const update = useServerFn(updateJob);
  const [form, setForm] = useState<Job>(job);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(job), [job.id]);

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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Job</h2>
          <p className="text-xs text-muted-foreground">
            {saving ? "Saving…" : savedAt ? `Saved at ${savedAt}` : "Edits autosave on blur."}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          onBlur={(e) => e.target.value !== job.title && save({ title: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          rows={10}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          onBlur={(e) => e.target.value !== job.description && save({ description: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Requirements (one per line)</Label>
        <Textarea
          rows={6}
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
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Location</Label>
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            onBlur={(e) => e.target.value !== job.location && save({ location: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Employment type</Label>
          <Select
            value={form.employment_type}
            onValueChange={(v) => save({ employment_type: v })}
          >
            <SelectTrigger>
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
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Salary min</Label>
          <Input
            type="number"
            value={form.salary_min ?? ""}
            onChange={(e) =>
              setForm({ ...form, salary_min: e.target.value === "" ? null : Number(e.target.value) })
            }
            onBlur={() => save({ salary_min: form.salary_min })}
          />
        </div>
        <div className="space-y-2">
          <Label>Salary max</Label>
          <Input
            type="number"
            value={form.salary_max ?? ""}
            onChange={(e) =>
              setForm({ ...form, salary_max: e.target.value === "" ? null : Number(e.target.value) })
            }
            onBlur={() => save({ salary_max: form.salary_max })}
          />
        </div>
        <div className="space-y-2">
          <Label>Currency</Label>
          <Input
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
            onBlur={(e) => e.target.value !== job.currency && save({ currency: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v) => save({ status: v })}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}