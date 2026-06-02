import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getInterviewLoop,
  upsertInterviewLoop,
  addStage as addStageFn,
  removeStage as removeStageFn,
  reorderStages as reorderStagesFn,
  confirmAllSchedules,
  cancelSchedule as cancelScheduleFn,
  type InterviewStage,
} from "@/lib/interviews/interviews.functions";
import { startCalendarConnect } from "@/lib/outreach/calendar.functions";
import { Calendar, Plus, X, ArrowRight, Dots, Check } from "@/components/findable-icons";
import { cn } from "@/lib/utils";

type Schedule = {
  id: string;
  stage_id: string;
  stage_name: string;
  candidate_name: string;
  candidate_email: string | null;
  start_at: string | null;
  end_at: string | null;
  is_async: boolean;
  google_event_id: string | null;
  meet_link: string | null;
  status: string;
};

const FORMATS = ["video", "async", "onsite", "phone"] as const;
type Format = (typeof FORMATS)[number];

function totalMinutes(stages: InterviewStage[]): number {
  return stages.reduce((acc, s) => acc + (s.duration_min || 0), 0);
}

function fmtTotal(min: number): string {
  if (min < 60) return `${min} min total`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m total` : `${h}h total`;
}

export function InterviewsPanel({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getInterviewLoop);
  const upsertFn = useServerFn(upsertInterviewLoop);
  const addFn = useServerFn(addStageFn);
  const removeFn = useServerFn(removeStageFn);
  const reorderFn = useServerFn(reorderStagesFn);
  const confirmAllFn = useServerFn(confirmAllSchedules);
  const cancelFn = useServerFn(cancelScheduleFn);
  const startCalFn = useServerFn(startCalendarConnect);

  const [view, setView] = useState<"loop" | "schedule">("loop");

  const { data, isLoading } = useQuery({
    queryKey: ["interview-loop", conversationId],
    queryFn: () => getFn({ data: { conversationId } }),
  });

  const loop = data?.loop ?? null;
  const schedules: Schedule[] = (data?.schedules ?? []) as Schedule[];
  const calendarConnected = Boolean(data?.calendarConnected);

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["interview-loop", conversationId] });

  // -----------------------------------------------------------------
  // Local editable copy of stages + debounced upsert
  const [stages, setStages] = useState<InterviewStage[]>([]);
  const hydrated = useRef(false);
  useEffect(() => {
    if (!loop) return;
    setStages((loop.stages as InterviewStage[]) ?? []);
    hydrated.current = true;
  }, [loop?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function persistStages(next: InterviewStage[]) {
    setStages(next);
    if (!loop) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await upsertFn({ data: { conversationId, stages: next } });
        refresh();
      } catch (e: any) {
        toast.error(e?.message ?? "Couldn't save");
      }
    }, 600);
  }

  const addMut = useMutation({
    mutationFn: (afterStageId?: string) =>
      addFn({ data: { conversationId, afterStageId } }),
    onSuccess: refresh,
  });
  const removeMut = useMutation({
    mutationFn: (stageId: string) =>
      removeFn({ data: { conversationId, stageId } }),
    onSuccess: refresh,
  });
  const confirmAllMut = useMutation({
    mutationFn: () => confirmAllFn({ data: { conversationId } }),
    onSuccess: (r) => {
      if (r.ok === false) {
        toast.error("Connect Google Calendar to send invites");
      } else {
        toast.success(
          `Confirmed ${r.confirmed}${r.failed ? ` · ${r.failed} failed` : ""}`,
        );
        refresh();
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Confirm failed"),
  });
  const cancelMut = useMutation({
    mutationFn: (scheduleId: string) => cancelFn({ data: { scheduleId } }),
    onSuccess: refresh,
  });

  const connectMut = useMutation({
    mutationFn: async () => {
      const returnUrl = `${window.location.origin}/oauth/google/return`;
      sessionStorage.setItem("google_oauth_return_to", window.location.pathname);
      sessionStorage.setItem("google_oauth_kind", "calendar");
      return startCalFn({ data: { returnUrl } });
    },
    onSuccess: ({ authorizationUrl }) => {
      window.location.href = authorizationUrl;
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't start connect"),
  });

  const weekCount = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    return schedules.filter(
      (s) =>
        s.start_at && new Date(s.start_at).getTime() >= now - 60_000 &&
        new Date(s.start_at).getTime() <= now + weekMs,
    ).length;
  }, [schedules]);

  // -----------------------------------------------------------------
  // Empty state: no loop yet
  if (!isLoading && !loop) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <SubHeader
          title="Interviews"
          subtitle="Define the loop. Ask the chat to set it up."
          view={view}
          setView={setView}
          showActions={false}
          onConfirmAll={() => {}}
          confirmBusy={false}
        />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-[440px] rounded-xl border border-dashed border-border bg-bg-elev p-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] bg-bg-bubble text-text">
              <Calendar size={18} />
            </div>
            <div className="text-[14px] font-semibold text-text">
              No interview loop yet
            </div>
            <p className="mt-1.5 text-[12.5px] text-text-mute">
              In the Chat tab, ask Findable to "set up the interview process".
              It will ask for stages, interviewers, and durations, then build the
              loop here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SubHeader
        title="Interviews"
        subtitle={
          loop
            ? `${stages.length}-stage loop · ${weekCount} scheduled this week`
            : "Loading…"
        }
        view={view}
        setView={setView}
        showActions={Boolean(loop)}
        onConfirmAll={() => confirmAllMut.mutate()}
        confirmBusy={confirmAllMut.isPending}
      />

      {view === "loop" ? (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-[820px]">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="text-[14px] font-semibold text-text">Interview loop</div>
                <div className="text-[12px] text-text-mute">
                  Edit names, formats, interviewers, and durations. Changes save
                  automatically.
                </div>
              </div>
              <div className="text-[12px] text-text-mute">
                {fmtTotal(totalMinutes(stages))} · {stages.length} stages
              </div>
            </div>

            <div className="space-y-3">
              {stages.map((stage, idx) => (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  index={idx}
                  count={stages.length}
                  onChange={(patch) =>
                    persistStages(
                      stages.map((s) =>
                        s.id === stage.id ? { ...s, ...patch } : s,
                      ),
                    )
                  }
                  onMove={(dir) => {
                    const i = stages.findIndex((s) => s.id === stage.id);
                    const j = dir === "up" ? i - 1 : i + 1;
                    if (j < 0 || j >= stages.length) return;
                    const next = stages.slice();
                    [next[i], next[j]] = [next[j], next[i]];
                    const ordered = next.map((s, k) => ({ ...s, order: k }));
                    setStages(ordered);
                    reorderFn({
                      data: {
                        conversationId,
                        stageIds: ordered.map((s) => s.id),
                      },
                    }).then(refresh).catch(() => {});
                  }}
                  onRemove={() => removeMut.mutate(stage.id)}
                />
              ))}
            </div>

            <button
              onClick={() => addMut.mutate(undefined)}
              disabled={addMut.isPending}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-bg-elev py-2.5 text-[12.5px] text-text-mute transition hover:border-border-strong hover:text-text disabled:opacity-50"
            >
              <Plus size={14} /> Add stage
            </button>

            {loop?.context ? (
              <div className="mt-6 rounded-lg border border-border bg-bg-elev p-4">
                <div className="mb-1 text-[11.5px] uppercase tracking-wide text-text-faint">
                  Loop context
                </div>
                <p className="whitespace-pre-wrap text-[13px] text-text">{loop.context}</p>
              </div>
            ) : null}
            {loop?.prep_tips ? (
              <div className="mt-3 rounded-lg border border-border bg-bg-elev p-4">
                <div className="mb-1 text-[11.5px] uppercase tracking-wide text-text-faint">
                  Prep tips
                </div>
                <p className="whitespace-pre-wrap text-[13px] text-text">{loop.prep_tips}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <ScheduleView
          schedules={schedules}
          calendarConnected={calendarConnected}
          onConnect={() => connectMut.mutate()}
          onCancel={(id) => cancelMut.mutate(id)}
          onConfirmAll={() => confirmAllMut.mutate()}
          confirmBusy={confirmAllMut.isPending}
          connectBusy={connectMut.isPending}
        />
      )}
    </div>
  );
}

// =====================================================================

function SubHeader({
  title,
  subtitle,
  view,
  setView,
  showActions,
  onConfirmAll,
  confirmBusy,
}: {
  title: string;
  subtitle: string;
  view: "loop" | "schedule";
  setView: (v: "loop" | "schedule") => void;
  showActions: boolean;
  onConfirmAll: () => void;
  confirmBusy: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-bg px-6 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-bg-bubble text-text">
          <Calendar size={18} />
        </div>
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-text">{title}</div>
          <div className="text-[12px] text-text-mute">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Segmented
          value={view}
          options={[
            { value: "loop", label: "Loop" },
            { value: "schedule", label: "Schedule" },
          ]}
          onChange={(v) => setView(v as "loop" | "schedule")}
        />
        {showActions && (
          <button
            onClick={onConfirmAll}
            disabled={confirmBusy}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-text px-3 text-[12px] font-medium text-text-invert transition hover:opacity-90 disabled:opacity-50"
          >
            {confirmBusy ? "Sending…" : "Send invites"} <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-bg-elev p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition",
            o.value === value
              ? "bg-bg-bubble text-text"
              : "text-text-mute hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StageCard({
  stage,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  stage: InterviewStage;
  index: number;
  count: number;
  onChange: (patch: Partial<InterviewStage>) => void;
  onMove: (dir: "up" | "down") => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-bg-elev">
      <div className="flex items-start gap-3 p-3.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-bubble text-[11.5px] font-mono font-semibold text-text">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={stage.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="min-w-[140px] flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13.5px] font-medium text-text outline-none transition hover:border-border focus:border-border-strong"
              placeholder="Stage name"
            />
            <FormatPill
              value={(stage.format as Format) ?? "video"}
              onChange={(v) => onChange({ format: v })}
            />
            <div className="flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-[12px] text-text">
              <input
                type="number"
                min={5}
                max={480}
                value={stage.duration_min ?? 30}
                onChange={(e) =>
                  onChange({ duration_min: Math.max(5, Number(e.target.value) || 30) })
                }
                className="w-12 bg-transparent text-right outline-none"
              />
              <span className="text-text-mute">min</span>
            </div>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-md p-1.5 text-text-mute hover:bg-bg-hover hover:text-text"
                aria-label="More"
              >
                <Dots size={14} />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-md border border-border bg-bg shadow-lg"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <MenuItem
                    disabled={index === 0}
                    onClick={() => {
                      onMove("up");
                      setMenuOpen(false);
                    }}
                  >
                    Move up
                  </MenuItem>
                  <MenuItem
                    disabled={index === count - 1}
                    onClick={() => {
                      onMove("down");
                      setMenuOpen(false);
                    }}
                  >
                    Move down
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      onRemove();
                    }}
                  >
                    Delete
                  </MenuItem>
                </div>
              )}
            </div>
          </div>

          <InterviewerEditor
            interviewers={stage.interviewers ?? []}
            onChange={(ints) => onChange({ interviewers: ints })}
          />

          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[11.5px] text-text-mute hover:text-text"
          >
            {open ? "Hide" : "Show"} description, focus & questions
          </button>

          {open && (
            <div className="space-y-3 pt-1">
              <div>
                <div className="mb-1 text-[11.5px] uppercase tracking-wide text-text-faint">
                  Description
                </div>
                <textarea
                  value={stage.description ?? ""}
                  onChange={(e) => onChange({ description: e.target.value })}
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-bg px-2.5 py-2 text-[13px] text-text outline-none focus:border-border-strong"
                  placeholder="What this stage is for…"
                />
              </div>
              <ListEditor
                label="Focus areas"
                items={stage.focus_areas ?? []}
                onChange={(items) => onChange({ focus_areas: items })}
              />
              <ListEditor
                label="Suggested questions"
                items={stage.suggested_questions ?? []}
                onChange={(items) => onChange({ suggested_questions: items })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="block w-full px-3 py-1.5 text-left text-[12.5px] text-text hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function FormatPill({
  value,
  onChange,
}: {
  value: Format;
  onChange: (v: Format) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Format)}
      className="rounded-md border border-border bg-bg px-2 py-1 text-[12px] font-medium text-text outline-none focus:border-border-strong"
    >
      <option value="video">Video</option>
      <option value="async">Async</option>
      <option value="onsite">Onsite</option>
      <option value="phone">Phone</option>
    </select>
  );
}

function InterviewerEditor({
  interviewers,
  onChange,
}: {
  interviewers: InterviewStage["interviewers"];
  onChange: (next: InterviewStage["interviewers"]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11.5px] text-text-faint">Interviewers:</span>
      {(interviewers ?? []).map((p, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 rounded-full border border-border bg-bg px-2 py-0.5 text-[12px] text-text"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bg-bubble text-[10px] font-semibold text-text">
            {(p.name || "?")[0]?.toUpperCase()}
          </span>
          <input
            value={p.name}
            onChange={(e) => {
              const next = (interviewers ?? []).slice();
              next[i] = { ...p, name: e.target.value };
              onChange(next);
            }}
            className="w-[90px] bg-transparent outline-none"
            placeholder="Name"
          />
          <span className="text-text-faint">·</span>
          <input
            value={p.role ?? ""}
            onChange={(e) => {
              const next = (interviewers ?? []).slice();
              next[i] = { ...p, role: e.target.value };
              onChange(next);
            }}
            className="w-[90px] bg-transparent text-text-mute outline-none"
            placeholder="Role"
          />
          <button
            onClick={() => {
              const next = (interviewers ?? []).slice();
              next.splice(i, 1);
              onChange(next);
            }}
            className="text-text-faint hover:text-text"
            aria-label="Remove interviewer"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([...(interviewers ?? []), { name: "", role: "" }])
        }
        className="flex items-center gap-1 rounded-full border border-dashed border-border bg-bg px-2 py-0.5 text-[11.5px] text-text-mute hover:text-text"
      >
        <Plus size={11} /> Add
      </button>
    </div>
  );
}

function ListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[11.5px] uppercase tracking-wide text-text-faint">
        {label}
      </div>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={it}
              onChange={(e) => {
                const next = items.slice();
                next[i] = e.target.value;
                onChange(next);
              }}
              className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-border-strong"
            />
            <button
              onClick={() => {
                const next = items.slice();
                next.splice(i, 1);
                onChange(next);
              }}
              className="text-text-faint hover:text-text"
              aria-label="Remove"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...items, ""])}
          className="flex items-center gap-1 text-[11.5px] text-text-mute hover:text-text"
        >
          <Plus size={11} /> Add
        </button>
      </div>
    </div>
  );
}

// =====================================================================

function ScheduleView({
  schedules,
  calendarConnected,
  onConnect,
  onCancel,
  onConfirmAll,
  confirmBusy,
  connectBusy,
}: {
  schedules: Schedule[];
  calendarConnected: boolean;
  onConnect: () => void;
  onCancel: (id: string) => void;
  onConfirmAll: () => void;
  confirmBusy: boolean;
  connectBusy: boolean;
}) {
  if (!calendarConnected) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-[440px] rounded-xl border border-border bg-bg-elev p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] bg-bg-bubble text-text">
            <Calendar size={18} />
          </div>
          <div className="text-[14px] font-semibold text-text">
            Connect Google Calendar
          </div>
          <p className="mt-1.5 text-[12.5px] text-text-mute">
            Findable will create real calendar events with Google Meet links and
            invite interviewers and the candidate.
          </p>
          <button
            onClick={onConnect}
            disabled={connectBusy}
            className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg bg-text px-3 text-[12.5px] font-medium text-text-invert hover:opacity-90 disabled:opacity-60"
          >
            {connectBusy ? "Opening…" : "Connect Google Calendar"}{" "}
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    );
  }

  const grouped = groupByDay(schedules);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-[820px]">
          {schedules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-elev p-8 text-center text-[12.5px] text-text-mute">
              No interviews scheduled yet. Ask the chat to "book {`{candidate}`} for
              the {`{stage}`}" with a date and time.
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([day, rows]) => (
                <div key={day}>
                  <div className="mb-2 text-[11.5px] uppercase tracking-wide text-text-faint">
                    {day}
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
                    {rows.map((s, i) => (
                      <div
                        key={s.id}
                        className={cn(
                          "flex items-center gap-3 px-3.5 py-2.5",
                          i > 0 && "border-t border-border",
                        )}
                      >
                        <div className="w-[110px] shrink-0 font-mono text-[12px] text-text">
                          {s.is_async
                            ? "Async"
                            : s.start_at
                              ? fmtTime(s.start_at)
                              : "—"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium text-text">
                            {s.candidate_name} · {s.stage_name}
                          </div>
                          <div className="truncate text-[11.5px] text-text-mute">
                            {s.status === "confirmed"
                              ? s.meet_link
                                ? "Confirmed · Google Meet"
                                : "Confirmed"
                              : "Pending invite"}
                          </div>
                        </div>
                        <StatusPill status={s.status} />
                        <button
                          onClick={() => onCancel(s.id)}
                          className="rounded-md p-1.5 text-text-faint hover:bg-bg-hover hover:text-text"
                          aria-label="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-bg-side px-6 py-3">
        <div className="text-[12px] text-text-mute">
          Findable has pre-blocked these slots on your calendar.
        </div>
        <button
          onClick={onConfirmAll}
          disabled={confirmBusy}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-text px-3 text-[12px] font-medium text-text-invert hover:opacity-90 disabled:opacity-50"
        >
          <Check size={12} /> {confirmBusy ? "Sending…" : "Confirm all"}
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "confirmed"
      ? "bg-bg-bubble text-text"
      : "border border-border text-text-mute";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-medium", tone)}>
      {status}
    </span>
  );
}

function groupByDay(rows: Schedule[]): Array<[string, Schedule[]]> {
  const map = new Map<string, Schedule[]>();
  const sorted = rows.slice().sort((a, b) => {
    const at = a.start_at ? new Date(a.start_at).getTime() : Infinity;
    const bt = b.start_at ? new Date(b.start_at).getTime() : Infinity;
    return at - bt;
  });
  for (const r of sorted) {
    const key = r.start_at
      ? new Date(r.start_at).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })
      : "Async / unscheduled";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries());
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}