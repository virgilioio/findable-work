import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getOutreach,
  upsertOutreach,
  DEFAULT_LINKEDIN,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_BODY,
  DEFAULT_FOLLOWUPS,
} from "@/lib/outreach/outreach.functions";
import { listCandidates } from "@/lib/candidates.functions";
import { Send, Linkedin, Sparkle, Calendar, Check } from "@/components/findable-icons";
import { cn } from "@/lib/utils";

type Followup = { day: number; channel: string; subject: string; enabled: boolean };

const TONES = ["Warm", "Direct", "Casual"] as const;
const LI_MAX = 200;
const VARS = ["first_name", "company", "role", "recruiter_name"];

function applyVars(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || `{{${k}}}`);
}

function firstName(name: string) {
  return (name || "").split(" ")[0] || "there";
}

export function OutreachPanel({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getOutreach);
  const upsert = useServerFn(upsertOutreach);
  const listC = useServerFn(listCandidates);

  const { data: row } = useQuery({
    queryKey: ["outreach", conversationId],
    queryFn: () => get({ data: { conversationId } }),
  });
  const { data: candidates } = useQuery({
    queryKey: ["candidates", conversationId],
    queryFn: () => listC({ data: { conversationId } }),
  });

  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
  const [tone, setTone] = useState<(typeof TONES)[number]>("Warm");
  const [li, setLi] = useState(DEFAULT_LINKEDIN);
  const [subject, setSubject] = useState(DEFAULT_EMAIL_SUBJECT);
  const [body, setBody] = useState(DEFAULT_EMAIL_BODY);
  const [followups, setFollowups] = useState<Followup[]>(DEFAULT_FOLLOWUPS as Followup[]);
  const [toggles, setToggles] = useState({
    personalize_ai: true,
    local_time_send: true,
    pause_if_reply: true,
    skip_if_recent: true,
  });
  const [previewIdx, setPreviewIdx] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from server
  useEffect(() => {
    if (!row || hydrated) return;
    setChannel((row.channel as "linkedin" | "email") || "linkedin");
    setTone((row.tone as (typeof TONES)[number]) || "Warm");
    if (row.linkedin_template) setLi(row.linkedin_template);
    if (row.email_subject) setSubject(row.email_subject);
    if (row.email_body) setBody(row.email_body);
    if (Array.isArray(row.followups) && row.followups.length) setFollowups(row.followups as Followup[]);
    setToggles({
      personalize_ai: row.personalize_ai,
      local_time_send: row.local_time_send,
      pause_if_reply: row.pause_if_reply,
      skip_if_recent: row.skip_if_recent,
    });
    setHydrated(true);
  }, [row, hydrated]);

  // Debounced save
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      upsert({
        data: {
          conversationId,
          patch: {
            channel,
            tone,
            linkedin_template: li,
            email_subject: subject,
            email_body: body,
            followups,
            ...toggles,
          },
        },
      }).then(() => {
        qc.invalidateQueries({ queryKey: ["outreach", conversationId] });
      }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, tone, li, subject, body, followups, toggles, hydrated]);

  const liCount = li.length;
  const liOver = liCount > LI_MAX;

  const previewPool = useMemo(() => {
    const all = (candidates ?? []) as Array<{ id: string; name: string; company: string; role: string; avatar: string; starred: boolean }>;
    const starred = all.filter((c) => c.starred);
    const pool = starred.length >= 3 ? starred.slice(0, 3) : all.slice(0, 3);
    return pool.length
      ? pool
      : [{ id: "demo", name: "María Fernández", company: "Kueski", role: "Senior SDR", avatar: "MF", starred: false }];
  }, [candidates]);

  const previewCand = previewPool[Math.min(previewIdx, previewPool.length - 1)];
  const previewVars = {
    first_name: firstName(previewCand.name),
    company: previewCand.company || "your company",
    role: previewCand.role || "this role",
    recruiter_name: "Your name",
  };

  function insertVar(varName: string) {
    const token = `{{${varName}}}`;
    if (channel === "linkedin") setLi(li + token);
    else setBody(body + token);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sub-header */}
      <div className="flex items-center justify-between border-b border-border bg-bg px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-bg-bubble text-text">
            <Send size={18} />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-text">Outreach</div>
            <div className="text-[12px] text-text-mute">Templates · sequence · personalization</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            value={channel}
            options={[
              { value: "linkedin", label: "LinkedIn", icon: <Linkedin size={13} /> },
              { value: "email", label: "Email", icon: <Send size={13} /> },
            ]}
            onChange={(v) => setChannel(v as "linkedin" | "email")}
          />
          <Segmented
            value={tone}
            options={TONES.map((t) => ({ value: t, label: t }))}
            onChange={(v) => setTone(v as (typeof TONES)[number])}
          />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_440px]">
        {/* Editor */}
        <div className="flex flex-col gap-5 overflow-y-auto p-6">
          {channel === "linkedin" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[12.5px] font-medium text-text">LinkedIn message</label>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-mono text-[11px]",
                    liOver ? "bg-text text-text-invert" : "bg-bg-bubble text-text-mute",
                  )}
                >
                  {liCount} / {LI_MAX}
                </span>
              </div>
              <textarea
                value={li}
                onChange={(e) => setLi(e.target.value)}
                rows={6}
                className="w-full resize-none rounded-lg border border-border bg-bg-elev px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-border-strong"
              />
              {liOver && (
                <div className="rounded-md border border-border bg-bg-bubble px-3 py-2 text-[12px] text-text-mute">
                  Trim {liCount - LI_MAX} characters to fit LinkedIn's {LI_MAX}-char limit.
                </div>
              )}
              <VarBar onInsert={insertVar} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[12.5px] font-medium text-text">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-bg-elev px-3 text-[13.5px] text-text outline-none focus:border-border-strong"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[12.5px] font-medium text-text">Body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full resize-none rounded-lg border border-border bg-bg-elev px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-border-strong"
                />
              </div>
              <VarBar onInsert={insertVar} />
            </div>
          )}

          {/* Follow-up sequence */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[12.5px] font-medium text-text">Follow-up sequence</label>
              <span className="text-[11.5px] text-text-faint">3-step</span>
            </div>
            <div className="space-y-2">
              {followups.map((f, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-border bg-bg-elev px-3 py-2.5 transition",
                    !f.enabled && "opacity-60",
                  )}
                >
                  <div className="flex h-7 w-12 items-center justify-center rounded-md bg-bg-bubble text-[11px] font-mono text-text-mute">
                    {f.day === 0 ? "Day 0" : `+${f.day}d`}
                  </div>
                  <span className="rounded-full bg-bg-bubble px-2 py-0.5 text-[11px] font-medium text-text">
                    {f.channel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text">{f.subject}</span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-text-mute">
                    <input
                      type="checkbox"
                      checked={f.enabled}
                      onChange={(e) => {
                        const next = [...followups];
                        next[i] = { ...f, enabled: e.target.checked };
                        setFollowups(next);
                      }}
                      className="h-3.5 w-3.5 cursor-pointer accent-text"
                    />
                    On
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <label className="text-[12.5px] font-medium text-text">Personalization</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["personalize_ai", "AI-personalize per candidate"],
                  ["local_time_send", "Send in candidate's local time"],
                  ["pause_if_reply", "Pause sequence if they reply"],
                  ["skip_if_recent", "Skip if recently contacted"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-bg-elev px-3 py-2.5"
                >
                  <span className="text-[12.5px] text-text">{label}</span>
                  <input
                    type="checkbox"
                    checked={toggles[key]}
                    onChange={(e) => setToggles({ ...toggles, [key]: e.target.checked })}
                    className="h-3.5 w-3.5 cursor-pointer accent-text"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Benchmarks */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Open rate", value: "62%", delta: "+18% vs benchmark" },
              { label: "Reply rate", value: "21%", delta: "+9% vs benchmark" },
              { label: "Meetings", value: "7%", delta: "+3% vs benchmark" },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border border-border bg-bg-elev p-3">
                <div className="text-[11.5px] text-text-mute">{m.label}</div>
                <div className="mt-1 text-[18px] font-semibold tracking-tight text-text">{m.value}</div>
                <div className="text-[11px] text-text-faint">{m.delta}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="hidden border-l border-border bg-bg-side lg:flex lg:flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-[11.5px] uppercase tracking-wide text-text-faint">Preview</span>
            <div className="flex items-center gap-1">
              {previewPool.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => setPreviewIdx(i)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[10.5px] font-semibold transition",
                    i === previewIdx ? "bg-text text-text-invert" : "bg-bg-bubble text-text-mute hover:bg-bg-hover",
                  )}
                  title={c.name}
                >
                  {c.avatar || firstName(c.name)[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {channel === "linkedin" ? (
              <div className="rounded-xl border border-border bg-bg-elev p-4 shadow-sm">
                <div className="flex items-center gap-3 border-b border-border pb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0a66c2] text-[12px] font-semibold text-white">
                    {previewCand.avatar || firstName(previewCand.name)[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-text">{previewCand.name}</div>
                    <div className="truncate text-[11.5px] text-text-mute">{previewCand.role} · {previewCand.company}</div>
                  </div>
                  <Linkedin size={16} className="ml-auto text-[#0a66c2]" />
                </div>
                <div className="whitespace-pre-wrap pt-3 text-[13px] leading-relaxed text-text">
                  {applyVars(li, previewVars)}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-bg-elev shadow-sm">
                <div className="border-b border-border px-4 py-3 text-[12px] text-text-mute">
                  <div>
                    <span className="text-text-faint">To:</span>{" "}
                    <span className="text-text">
                      {firstName(previewCand.name).toLowerCase()}@{(previewCand.company || "company").toLowerCase().replace(/\s+/g, "")}.com
                    </span>
                  </div>
                  <div>
                    <span className="text-text-faint">Subject:</span>{" "}
                    <span className="font-medium text-text">{applyVars(subject, previewVars)}</span>
                  </div>
                </div>
                <div className="whitespace-pre-wrap px-4 py-4 text-[13px] leading-relaxed text-text">
                  {applyVars(body, previewVars)}
                </div>
              </div>
            )}
          </div>
        </div>
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
  options: { value: T; label: string; icon?: React.ReactNode }[];
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
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function VarBar({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11.5px] text-text-faint">Insert:</span>
      {VARS.map((v) => (
        <button
          key={v}
          onClick={() => onInsert(v)}
          className="rounded-full border border-border bg-bg-elev px-2 py-0.5 font-mono text-[11px] text-text-mute transition hover:bg-bg-hover hover:text-text"
        >
          {`{{${v}}}`}
        </button>
      ))}
    </div>
  );
}