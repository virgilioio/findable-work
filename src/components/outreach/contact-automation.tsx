import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { contactCandidates } from "@/lib/outreach/outreach.functions";
import { sendOutreachEmail } from "@/lib/outreach/gmail.functions";
import { useGmailConnection, ConnectGmailButton } from "./connect-gmail-card";
import { X, Check, Linkedin, Send } from "@/components/findable-icons";
import type { Candidate } from "@/components/candidates/candidate-drawer";

const LI_TEMPLATE = `Hi {{first_name}}, I'm helping a Series B SaaS team in CDMX hire for {{role}} — your work at {{company}} caught my eye. Open to a quick chat this week?`;

function personalize(t: string, c: Candidate) {
  const first = (c.name || "").split(" ")[0] || "there";
  return t
    .replaceAll("{{first_name}}", first)
    .replaceAll("{{company}}", c.company || "your company")
    .replaceAll("{{role}}", c.role || "this role");
}

type Progress = { step: 0 | 1 | 2; channel: "LinkedIn" | "Email"; revealed: number; full: string };

export function ContactAutomation({
  conversationId,
  candidates,
  onClose,
}: {
  conversationId: string;
  candidates: Candidate[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const contactFn = useServerFn(contactCandidates);
  const sendFn = useServerFn(sendOutreachEmail);
  const { data: gmail } = useGmailConnection();

  const [progress, setProgress] = useState<Progress[]>(() =>
    candidates.map((c, i) => ({
      step: 0,
      channel: i % 3 === 0 ? "Email" : "LinkedIn",
      revealed: 0,
      full: personalize(LI_TEMPLATE, c),
    })),
  );
  const [done, setDone] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Live mirror of progress so the tick loop can read latest values
  // without re-creating the effect.
  const progressRef = useRef<Progress[]>(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const persistMut = useMutation({
    mutationFn: async () => {
      if (gmail) {
        // Real Gmail send per candidate (only those with email).
        let sent = 0;
        for (const c of candidates) {
          if (!c.email) continue;
          const first = (c.name || "").split(" ")[0] || "there";
          const subject = `${c.role || "Opportunity"} — ${first}`;
          const body = personalize(LI_TEMPLATE, c);
          try {
            await sendFn({
              data: { conversationId, candidateId: c.id, subject, body },
            });
            sent++;
          } catch (err: any) {
            toast.error(`Failed for ${c.name}: ${err?.message ?? "send error"}`);
          }
        }
        return { sent };
      }
      await contactFn({ data: { conversationId, candidateIds: candidates.map((c) => c.id) } });
      return { sent: candidates.length };
    },
    onSuccess: ({ sent }) => {
      qc.invalidateQueries({ queryKey: ["candidates", conversationId] });
      qc.invalidateQueries({ queryKey: ["outreach-threads", conversationId] });
      toast.success(`${sent} candidate${sent === 1 ? "" : "s"} contacted`);
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update candidates"),
  });

  useEffect(() => {
    let cancelled = false;
    candidates.forEach((_, i) => {
      const startDelay = 250 + i * 600;
      const t1 = setTimeout(() => {
        if (cancelled) return;
        const tick = () => {
          if (cancelled) return;
          setProgress((p) => {
            const next = [...p];
            const cur = next[i];
            const newRevealed = Math.min(cur.full.length, cur.revealed + 8 + Math.floor(Math.random() * 6));
            next[i] = { ...cur, revealed: newRevealed };
            return next;
          });
          const cur = progressRef.current[i];
          if (cur && cur.revealed < cur.full.length) {
            const t = setTimeout(tick, 30);
            timersRef.current.push(t);
          } else {
            const t = setTimeout(() => {
              if (cancelled) return;
              setProgress((p) => p.map((x, idx) => (idx === i ? { ...x, step: 1 } : x)));
              const t2 = setTimeout(() => {
                if (cancelled) return;
                setProgress((p) => p.map((x, idx) => (idx === i ? { ...x, step: 2 } : x)));
              }, 700 + Math.random() * 400);
              timersRef.current.push(t2);
            }, 250);
            timersRef.current.push(t);
          }
        };
        tick();
      }, startDelay);
      timersRef.current.push(t1);
    });

    const totalTime = 250 + candidates.length * 600 + 3500;
    const tDone = setTimeout(() => {
      if (!cancelled) setDone(true);
    }, totalTime);
    timersRef.current.push(tDone);

    return () => {
      cancelled = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedCount = progress.filter((p) => p.step === 2).length;
  const pct = Math.round((completedCount / candidates.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border bg-bg px-6 py-4">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-text">
            Findable is sending outreach
          </div>
          <div className="text-[12px] text-text-mute">
            {completedCount} of {candidates.length} sent · {pct}%
          </div>
        </div>
        <button
          onClick={() => {
            if (persistMut.isPending) return;
            onClose();
          }}
          className="rounded-md p-1.5 text-text-mute transition hover:bg-bg-hover hover:text-text"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="h-1 w-full bg-bg-bubble">
        <div
          className="h-full bg-text transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {candidates.map((c, i) => {
            const p = progress[i];
            return (
              <div
                key={c.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-bg-elev p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-input text-[12px] font-semibold text-text">
                  {c.avatar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-text">{c.name}</span>
                    <span className="truncate text-[12px] text-text-mute">· {c.role} @ {c.company}</span>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap rounded-md bg-bg-bubble px-3 py-2 text-[12.5px] leading-relaxed text-text">
                    {p.full.slice(0, p.revealed)}
                    {p.step === 0 && p.revealed < p.full.length && (
                      <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-text align-middle" />
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11.5px]">
                    <StatusPill step={p.step} channel={p.channel} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-bg px-6 py-4">
        {done ? (
          !gmail ? (
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-text-mute">
                Connect Gmail to send for real from your address.
              </span>
              <ConnectGmailButton label="Connect Gmail" />
              <button
                onClick={() => persistMut.mutate()}
                disabled={persistMut.isPending}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3.5 text-[13px] font-medium text-text disabled:opacity-60"
              >
                {persistMut.isPending ? "Saving…" : "Mark as contacted only"}
              </button>
            </div>
          ) : (
          <button
            disabled={persistMut.isPending}
            onClick={() => persistMut.mutate()}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-text px-4 text-[13px] font-medium text-text-invert transition hover:opacity-90 disabled:opacity-60"
          >
            {persistMut.isPending ? "Sending via Gmail…" : `Send via ${gmail.email}`}
          </button>
          )
        ) : (
          <span className="text-[12px] text-text-mute">Sending…</span>
        )}
      </div>
    </div>
  );
}

function StatusPill({ step, channel }: { step: 0 | 1 | 2; channel: "LinkedIn" | "Email" }) {
  if (step === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-bubble px-2 py-0.5 text-text-mute">
        <span className="thinking-dot" />
        Personalizing
      </span>
    );
  }
  if (step === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-bubble px-2 py-0.5 text-text-mute">
        {channel === "LinkedIn" ? <Linkedin size={11} /> : <Send size={11} />}
        Sending via {channel}…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-text px-2 py-0.5 text-text-invert">
      <Check size={11} />
      Sent · moved to Contacted
    </span>
  );
}