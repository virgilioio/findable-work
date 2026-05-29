import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Megaphone, Copy, Sparkle, Linkedin } from "@/components/findable-icons";
import { updateJobPost, regenerateJobPosts } from "@/lib/job-posts.functions";
import { Markdown } from "@/components/ui/markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Variant = { key: string; label: string; sublabel: string; title: string; body: string };
type Channel = {
  key: string;
  name: string;
  kind: "job_board" | "social";
  audience: number;
  audience_label: string;
  price: number;
  price_label: string;
  duration_days: number;
  recommended: boolean;
  selected: boolean;
};
type Schedule = {
  go_live: string | null;
  go_live_label: string;
  auto_close_days: number;
  auto_close_label: string;
  ab_test: boolean;
  ab_test_label: string;
};

export type JobPost = {
  id: string;
  conversation_id: string;
  variants: Variant[];
  channels: Channel[];
  schedule: Schedule;
  est_reach: number;
  status: "draft" | "published";
};

function fmtReach(n: number): string {
  if (n >= 1000) return `~${Math.round(n / 1000)}k`;
  return `~${n}`;
}

export function JobPostsPanel({
  jobPost,
  conversationId,
}: {
  jobPost: JobPost;
  conversationId: string;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateJobPost);
  const regen = useServerFn(regenerateJobPosts);

  const [variants, setVariants] = useState<Variant[]>(jobPost.variants);
  const [channels, setChannels] = useState<Channel[]>(jobPost.channels);
  const [activeKey, setActiveKey] = useState<string>(jobPost.variants[0]?.key ?? "");
  const [regenerating, setRegenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    setVariants(jobPost.variants);
    setChannels(jobPost.channels);
    if (!jobPost.variants.find((v) => v.key === activeKey)) {
      setActiveKey(jobPost.variants[0]?.key ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobPost.id]);

  const active = useMemo(
    () => variants.find((v) => v.key === activeKey) ?? variants[0],
    [variants, activeKey],
  );
  const selectedCount = channels.filter((c) => c.selected).length;
  const estReach = channels.filter((c) => c.selected).reduce((s, c) => s + c.audience, 0);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleSave(nextVariants?: Variant[], nextChannels?: Channel[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await update({
          data: {
            conversationId,
            variants: nextVariants,
            channels: nextChannels,
          },
        });
        qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      } catch (e) {
        toast.error("Could not save changes");
      }
    }, 500);
  }

  function patchActive(patch: Partial<Variant>) {
    const next = variants.map((v) => (v.key === active?.key ? { ...v, ...patch } : v));
    setVariants(next);
    scheduleSave(next, undefined);
  }

  function toggleChannel(key: string) {
    const next = channels.map((c) => (c.key === key ? { ...c, selected: !c.selected } : c));
    setChannels(next);
    scheduleSave(undefined, next);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await regen({ data: { conversationId } });
      await qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      toast.success("Regenerated 3 fresh variants");
    } catch (e) {
      toast.error("Could not regenerate");
    } finally {
      setRegenerating(false);
    }
  }

  async function handlePublish() {
    if (selectedCount === 0) {
      toast.error("Select at least one channel");
      return;
    }
    setPublishing(true);
    try {
      await update({ data: { conversationId, status: "published" } });
      await qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      toast.success(`Queued to ${selectedCount} channels — publishing is coming soon`);
    } finally {
      setPublishing(false);
    }
  }

  const body = active?.body ?? "";
  const chars = body.length;
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-8 py-7">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] text-text">
            <Megaphone size={18} />
          </div>
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight text-text">Job Posts</h2>
            <p className="mt-0.5 text-[12.5px] text-text-mute">
              {variants.length} copy variants · {selectedCount} channel{selectedCount === 1 ? "" : "s"} selected
              {" · "}est. reach {fmtReach(estReach)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-text-mute transition hover:bg-bg-hover hover:text-text disabled:opacity-60"
          >
            <Sparkle size={12} />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || selectedCount === 0}
            className="flex h-9 items-center gap-2 rounded-[10px] bg-text px-3.5 text-[13px] font-medium text-text-invert transition hover:opacity-90 disabled:opacity-40"
          >
            <span>Publish to {selectedCount} channel{selectedCount === 1 ? "" : "s"}</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      {/* Two columns */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left — variants + editor */}
        <div>
          {/* Variant tabs */}
          <div className="grid grid-cols-3 overflow-hidden rounded-[12px] border border-border bg-bg-elev">
            {variants.map((v) => {
              const isActive = v.key === active?.key;
              return (
                <button
                  key={v.key}
                  onClick={() => setActiveKey(v.key)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 px-4 py-3 text-left transition",
                    isActive
                      ? "bg-bg shadow-[var(--shadow-sm)]"
                      : "text-text-mute hover:bg-bg-hover",
                  )}
                >
                  <span className={cn("text-[13.5px] font-medium", isActive ? "text-text" : "text-text-mute")}>
                    {v.label}
                  </span>
                  <span className="text-[11.5px] text-text-faint">{v.sublabel}</span>
                </button>
              );
            })}
          </div>

          {/* Editor card */}
          <div className="mt-4 rounded-[14px] border border-border bg-bg-elev">
            <div className="px-5 pt-5">
              <input
                value={active?.title ?? ""}
                onChange={(e) => patchActive({ title: e.target.value })}
                placeholder="Post title"
                className="w-full bg-transparent text-[17px] font-semibold tracking-tight text-text outline-none placeholder:text-text-faint"
              />
              <p className="mt-1 text-[11.5px] text-text-faint">
                {chars} chars · {words} words
              </p>
            </div>
            <div className="px-5 pt-3">
              <textarea
                value={body}
                onChange={(e) => patchActive({ body: e.target.value })}
                rows={12}
                placeholder="Post body"
                className="w-full resize-y bg-transparent text-[14px] leading-relaxed text-text outline-none placeholder:text-text-faint"
              />
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (!active) return;
                    navigator.clipboard.writeText(`${active.title}\n\n${active.body}`);
                    toast.success("Copied to clipboard");
                  }}
                  className="rounded-md p-1.5 text-text-mute transition hover:bg-bg-hover hover:text-text"
                  aria-label="Copy"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="rounded-md p-1.5 text-text-mute transition hover:bg-bg-hover hover:text-text disabled:opacity-60"
                  aria-label="Regenerate this variant"
                >
                  <Sparkle size={14} />
                </button>
              </div>
              <button
                onClick={() => setPreview(true)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] text-text-mute transition hover:bg-bg-hover hover:text-text"
              >
                Preview as LinkedIn post
              </button>
            </div>
          </div>
        </div>

        {/* Right — channels + schedule */}
        <aside className="space-y-6">
          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Channels
            </h3>
            <div className="space-y-2">
              {channels.map((c) => (
                <label
                  key={c.key}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[12px] border bg-bg-elev p-3 transition",
                    c.selected ? "border-border-strong" : "border-border hover:bg-bg-hover",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={() => toggleChannel(c.key)}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-text)]"
                  />
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-bg-bubble text-text-mute">
                    {c.key === "linkedin" ? <Linkedin size={12} /> : <Megaphone size={12} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-text">{c.name}</span>
                      {c.recommended && (
                        <span className="rounded-sm bg-bg-bubble px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-mute">
                          Recommended
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11.5px] text-text-mute">
                      {c.audience_label}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[11.5px] text-text-mute">{c.price_label}</span>
                    <span className="block text-[10.5px] text-text-faint">
                      {c.duration_days > 0 ? `/ ${c.duration_days} days` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Schedule
            </h3>
            <div className="rounded-[12px] border border-border bg-bg-elev">
              <ScheduleRow label="Go live" value={jobPost.schedule.go_live_label} />
              <ScheduleRow label="Auto-close" value={jobPost.schedule.auto_close_label} />
              <ScheduleRow
                label="A/B test variants"
                value={jobPost.schedule.ab_test_label}
                last
              />
            </div>
          </section>
        </aside>
      </div>

      {/* LinkedIn preview modal */}
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>LinkedIn preview</DialogTitle>
          </DialogHeader>
          <div className="rounded-[12px] border border-border bg-bg p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-bubble text-text">
                <Linkedin size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-text">Your company</p>
                <p className="text-[11px] text-text-faint">Sponsored · Just now</p>
              </div>
            </div>
            <p className="mt-3 text-[14.5px] font-semibold leading-snug text-text">
              {active?.title}
            </p>
            <div className="mt-2">
              <Markdown className="text-[13.5px]">{active?.body ?? ""}</Markdown>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduleRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-2.5 text-[13px]",
        !last && "border-b border-border",
      )}
    >
      <span className="text-text-mute">{label}</span>
      <span className="text-text">{value}</span>
    </div>
  );
}