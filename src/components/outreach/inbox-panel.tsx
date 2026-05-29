import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listOutreachThreads,
  getOutreachThread,
  replyInThread,
  syncOutreachReplies,
} from "@/lib/outreach/gmail.functions";
import { ConnectGmailButton, useGmailConnection } from "./connect-gmail-card";
import { Send } from "@/components/findable-icons";
import { cn } from "@/lib/utils";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function InboxPanel({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const { data: gmail } = useGmailConnection();
  const listFn = useServerFn(listOutreachThreads);
  const getFn = useServerFn(getOutreachThread);
  const replyFn = useServerFn(replyInThread);
  const syncFn = useServerFn(syncOutreachReplies);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"All" | "Replied" | "Awaiting">("All");
  const [draft, setDraft] = useState("");

  const { data: threadsData } = useQuery({
    queryKey: ["outreach-threads", conversationId],
    queryFn: () => listFn({ data: { conversationId } }),
    refetchInterval: gmail ? 30000 : false,
  });

  // Sync inbound replies in the background while the inbox is open.
  useEffect(() => {
    if (!gmail) return;
    const run = () => {
      syncFn({ data: { conversationId } })
        .then(() => qc.invalidateQueries({ queryKey: ["outreach-threads", conversationId] }))
        .catch(() => {});
    };
    run();
    const id = setInterval(run, 30000);
    return () => clearInterval(id);
  }, [gmail, conversationId, syncFn, qc]);

  const threads = threadsData?.threads ?? [];
  const filtered = useMemo(() => {
    if (filter === "Replied") return threads.filter((t) => t.status === "replied");
    if (filter === "Awaiting") return threads.filter((t) => t.status !== "replied");
    return threads;
  }, [threads, filter]);

  // Auto-select first thread
  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const { data: threadData } = useQuery({
    queryKey: ["outreach-thread", selectedId],
    queryFn: () => getFn({ data: { threadId: selectedId! } }),
    enabled: !!selectedId,
  });

  const replyMut = useMutation({
    mutationFn: (body: string) => replyFn({ data: { threadId: selectedId!, body } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["outreach-thread", selectedId] });
      qc.invalidateQueries({ queryKey: ["outreach-threads", conversationId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Reply failed"),
  });

  if (!gmail) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-bubble text-text">
          <Send size={22} />
        </div>
        <div className="mt-4 text-[15px] font-semibold text-text">Connect your Gmail to use the Inbox</div>
        <div className="mt-1 max-w-[400px] text-[12.5px] text-text-mute">
          Findable sends from your address and reads replies right in your inbox. One-click sign-in with Google.
        </div>
        <div className="mt-4">
          <ConnectGmailButton />
        </div>
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-bubble text-text">
          <Send size={22} />
        </div>
        <div className="mt-4 text-[15px] font-semibold text-text">No outreach yet</div>
        <div className="mt-1 max-w-[360px] text-[12.5px] text-text-mute">
          Send your first email from a candidate to start a conversation.
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[320px_1fr] overflow-hidden">
      {/* Threads list */}
      <div className="flex flex-col overflow-hidden border-r border-border bg-bg-side">
        <div className="flex items-center gap-1 border-b border-border px-3 py-2">
          {(["All", "Replied", "Awaiting"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11.5px] transition",
                filter === f ? "bg-bg-bubble text-text" : "text-text-mute hover:text-text",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((t) => {
            const cand = t.candidate;
            const active = t.id === selectedId;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition",
                  active ? "bg-bg-bubble" : "hover:bg-bg-hover",
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-input text-[12px] font-semibold text-text">
                  {cand?.avatar ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-text">
                      {cand?.name ?? "Unknown"}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-text-faint">{relTime(t.last_message_at)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11.5px] text-text-mute">{t.subject}</div>
                  <div className="mt-1 line-clamp-1 text-[12px] text-text-mute">{t.last_snippet}</div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        t.status === "replied" ? "bg-emerald-500" : "bg-text-mute/50",
                      )}
                    />
                    <span className="text-[10.5px] uppercase tracking-wide text-text-faint">
                      {t.status === "replied" ? "Replied" : "Awaiting"}
                    </span>
                    {t.unread && <span className="ml-1 rounded-full bg-text px-1.5 text-[10px] font-medium text-text-invert">New</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex flex-col overflow-hidden">
        {threadData ? (
          <>
            <div className="flex items-center justify-between border-b border-border bg-bg px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-text">
                  {threadData.candidate?.name ?? "Unknown"}{" "}
                  <span className="font-normal text-text-mute">
                    · {threadData.candidate?.role}
                  </span>
                </div>
                <div className="truncate text-[11.5px] text-text-mute">
                  Email · {threadData.candidate?.email}
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                  threadData.thread.status === "replied"
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-bg-bubble text-text-mute",
                )}
              >
                {threadData.thread.status === "replied" ? "Replied" : "Sent"}
              </span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-bg-side px-5 py-5">
              {threadData.messages.map((m: any) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    m.direction === "out" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
                      m.direction === "out"
                        ? "bg-text text-text-invert"
                        : "border border-border bg-bg-elev text-text",
                    )}
                  >
                    {m.body_text}
                    <div
                      className={cn(
                        "mt-1 text-[10.5px]",
                        m.direction === "out" ? "text-text-invert/60" : "text-text-faint",
                      )}
                    >
                      {new Date(m.sent_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border bg-bg p-3">
              <div className="flex items-end gap-2 rounded-xl border border-border bg-bg-elev p-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (draft.trim()) replyMut.mutate(draft.trim());
                    }
                  }}
                  rows={2}
                  placeholder="Write a reply… (Enter to send, Shift+Enter for newline)"
                  className="min-h-[40px] flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-text-faint"
                />
                <button
                  onClick={() => draft.trim() && replyMut.mutate(draft.trim())}
                  disabled={!draft.trim() || replyMut.isPending}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-text px-3 text-[12.5px] font-medium text-text-invert transition hover:opacity-90 disabled:opacity-50"
                >
                  <Send size={13} />
                  {replyMut.isPending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-[12.5px] text-text-faint">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}