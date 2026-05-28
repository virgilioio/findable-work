import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { updateCandidate, deleteCandidate } from "@/lib/candidates.functions";
import { cn } from "@/lib/utils";
import {
  X,
  Star,
  Dots,
  ChevDown,
  Check,
  Sparkle,
  Linkedin,
  Users,
  Folder,
  Send,
  Calendar,
  Doc,
} from "@/components/gio-icons";

const STAGES = ["Sourced", "Contacted", "Screening", "Interview", "Offer"] as const;
type Stage = (typeof STAGES)[number];

export type Candidate = {
  id: string;
  conversation_id: string;
  name: string;
  role: string;
  company: string;
  stage: Stage;
  source: string;
  match: number;
  tags: string[];
  starred: boolean;
  avatar: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  location: string | null;
  summary: string | null;
  experience: Array<{ id: number; role: string; company: string; period: string; desc: string }>;
  education: Array<{ school: string; degree: string; period: string }>;
  match_breakdown: Array<{ label: string; score: number; note: string }>;
  activity: Array<{ id: number; type: string; by: string; when: string; text: string }>;
};

export function CandidateDrawer({
  candidate,
  onClose,
  onAskFindable,
}: {
  candidate: Candidate;
  onClose: () => void;
  onAskFindable: (c: Candidate) => void;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateCandidate);
  const del = useServerFn(deleteCandidate);
  const [tab, setTab] = useState<"overview" | "resume" | "activity">("overview");
  const [stageMenu, setStageMenu] = useState(false);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const inv = () => qc.invalidateQueries({ queryKey: ["candidates", candidate.conversation_id] });

  const stageMut = useMutation({
    mutationFn: (stage: Stage) => update({ data: { id: candidate.id, stage } }),
    onSuccess: (_d, stage) => {
      inv();
      toast(`Moved to ${stage}`);
    },
  });
  const starMut = useMutation({
    mutationFn: () => update({ data: { id: candidate.id, starred: !candidate.starred } }),
    onSuccess: inv,
  });
  const rejectMut = useMutation({
    mutationFn: () => del({ data: { id: candidate.id } }),
    onSuccess: () => {
      inv();
      toast(`Rejected ${candidate.name}`);
      onClose();
    },
  });

  const stageIdx = STAGES.indexOf(candidate.stage);

  return (
    <div
      className="absolute inset-0 z-40 flex justify-end bg-black/25"
      onClick={onClose}
    >
      <aside
        className="fade-up flex h-full w-[500px] max-w-full flex-col border-l border-border bg-bg shadow-[var(--shadow-md)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center gap-1 border-b border-border px-3 py-2">
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-text-mute hover:bg-bg-hover" title="Close">
            <X size={16} />
          </button>
          <div className="flex-1" />
          <button onClick={() => starMut.mutate()} className="flex h-7 w-7 items-center justify-center rounded-md text-text-mute hover:bg-bg-hover" title={candidate.starred ? "Unflag" : "Flag"}>
            <Star size={16} fill={candidate.starred ? "currentColor" : "none"} />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-text-mute hover:bg-bg-hover">
            <Dots size={16} />
          </button>
          <button onClick={() => rejectMut.mutate()} className="h-7 rounded-md px-2.5 text-[12.5px] text-text-mute hover:bg-bg-hover">
            Reject
          </button>
        </div>

        {/* Header */}
        <div className="flex gap-4 px-5 pb-3.5 pt-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-bg-input text-[18px] font-semibold text-text">
            {candidate.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-semibold leading-tight tracking-tight text-text">{candidate.name}</h2>
              {candidate.starred && <Star size={13} fill="currentColor" className="text-text-mute" />}
            </div>
            <div className="mt-0.5 text-[13px] text-text">{candidate.role}</div>
            <div className="mt-0.5 text-[12.5px] text-text-mute">
              {candidate.company} · {candidate.location ?? "—"}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <div className="relative">
                <button
                  onClick={() => setStageMenu((o) => !o)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-bg-elev px-2.5 py-1 text-[12px] text-text"
                >
                  <span className="flex gap-0.5">
                    {STAGES.map((_, i) => (
                      <span
                        key={i}
                        className={cn("h-1 w-1.5 rounded-[1px]", i <= stageIdx ? "bg-text" : "bg-border-strong")}
                      />
                    ))}
                  </span>
                  {candidate.stage}
                  <ChevDown size={12} />
                </button>
                {stageMenu && (
                  <div className="absolute left-0 top-[calc(100%+4px)] z-10 min-w-[160px] rounded-lg border border-border-strong bg-bg-elev p-1 shadow-[var(--shadow-md)]">
                    {STAGES.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          stageMut.mutate(s);
                          setStageMenu(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-text hover:bg-bg-hover",
                          s === candidate.stage && "bg-bg-hover",
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", STAGES.indexOf(s) <= stageIdx ? "bg-text" : "bg-border-strong")} />
                        {s}
                        {s === candidate.stage && <Check size={12} className="ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <SourceTag source={candidate.source} />
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-input px-2 py-0.5 text-[11.5px] font-medium text-text">
                <Sparkle size={11} /> {candidate.match}% match
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 border-b border-border px-5 pb-3.5">
          <button className="flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-text text-[13px] font-medium text-text-invert">
            <Send size={13} /> Send outreach
          </button>
          <button className="flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-bg-elev text-[13px] text-text">
            <Calendar size={13} /> Schedule interview
          </button>
          <button className="flex h-[34px] w-8 items-center justify-center rounded-lg border border-border-strong bg-bg-elev text-text-mute" title="Email">
            <Doc size={14} />
          </button>
          <button className="flex h-[34px] w-8 items-center justify-center rounded-lg border border-border-strong bg-bg-elev text-text-mute" title="LinkedIn">
            <Linkedin size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border px-5 pt-2">
          {(["overview", "resume", "activity"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] capitalize text-text-mute",
                tab === t && "border-text font-medium text-text",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "overview" && <Overview c={candidate} />}
          {tab === "resume" && <Resume c={candidate} />}
          {tab === "activity" && (
            <Activity c={candidate} onAskFindable={() => onAskFindable(candidate)} />
          )}
        </div>
      </aside>
    </div>
  );
}

function SourceTag({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-bg-input px-2 py-0.5 text-[11.5px] text-text-mute">
      {source === "LinkedIn" && <Linkedin size={11} />}
      {source === "Referral" && <Users size={11} />}
      {source === "Talent pool" && <Folder size={11} />}
      {source}
    </span>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-mute">
        {icon}
        {title}
      </div>
      <div>{children}</div>
    </section>
  );
}

function KV({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1.5 text-[13px]">
      <span className="text-text-mute">{label}</span>
      <span className="min-w-0 truncate text-right text-text">{children ?? value}</span>
    </div>
  );
}

function Overview({ c }: { c: Candidate }) {
  return (
    <div className="flex flex-col gap-5 px-5 pb-8 pt-4">
      {c.summary && (
        <Section title="Summary">
          <p className="m-0 text-[13.5px] leading-relaxed text-text">{c.summary}</p>
        </Section>
      )}
      <Section title="AI match breakdown" icon={<Sparkle size={12} />}>
        <div className="flex flex-col gap-2">
          {c.match_breakdown.map((m) => (
            <div key={m.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-text">{m.label}</span>
                <span className="font-mono text-[11.5px] text-text-mute">{m.score}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-sm bg-bg-input">
                <div className="h-full bg-text" style={{ width: `${m.score}%` }} />
              </div>
              <div className="mt-0.5 text-[11.5px] text-text-mute">{m.note}</div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Contact">
        {c.email && (
          <KV label="Email">
            <a href={`mailto:${c.email}`} className="text-text underline decoration-border-strong underline-offset-2">{c.email}</a>
          </KV>
        )}
        {c.linkedin && (
          <KV label="LinkedIn">
            <a href="#" className="text-text underline decoration-border-strong underline-offset-2">{c.linkedin}</a>
          </KV>
        )}
        {c.phone && <KV label="Phone" value={c.phone} />}
        {c.location && <KV label="Location" value={c.location} />}
      </Section>
      <Section title="Skills & tags">
        <div className="flex flex-wrap gap-1.5">
          {c.tags.map((t) => (
            <span key={t} className="rounded bg-bg-input px-2 py-0.5 font-mono text-[11.5px] text-text-mute">{t}</span>
          ))}
        </div>
      </Section>
      <Section title="Experience">
        <div className="relative">
          {c.experience.map((x, i) => (
            <div key={x.id} className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <div className="h-2 w-2 rounded-full bg-border-strong" />
                {i < c.experience.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
              </div>
              <div className="flex-1 pb-3.5">
                <div className="text-[13.5px] font-medium text-text">{x.role}</div>
                <div className="text-[12.5px] text-text-mute">
                  {x.company} · <span className="font-mono">{x.period}</span>
                </div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-text-mute">{x.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Education">
        {c.education.map((ed, i) => (
          <div key={i} className="flex justify-between py-1.5 text-[13px]">
            <div>
              <div className="text-text">{ed.school}</div>
              <div className="text-[12.5px] text-text-mute">{ed.degree}</div>
            </div>
            <span className="font-mono text-[11.5px] text-text-mute">{ed.period}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Resume({ c }: { c: Candidate }) {
  return (
    <div className="flex flex-col gap-4 px-5 pb-8 pt-4">
      <div className="flex items-center justify-between rounded-lg border border-border bg-bg-elev px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Doc size={14} />
          <span className="text-[13px] text-text">{c.name.replace(/\s+/g, "_")}_Resume.pdf</span>
          <span className="font-mono text-[11.5px] text-text-faint">· 2 pages · 184 KB</span>
        </div>
        <button className="h-7 rounded-md border border-border-strong bg-bg-elev px-2.5 text-[12px] text-text">
          Download
        </button>
      </div>
      <div className="relative min-h-[600px] rounded-md border border-border bg-white p-8 text-[#111] shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
        <div className="text-[22px] font-bold tracking-tight text-[#111]">{c.name}</div>
        <div className="mt-1 font-mono text-[11px] text-[#555]">
          {c.email} · {c.phone} · {c.location}
        </div>
        <div className="my-3.5 h-px bg-[#222]" />
        <ResumeSec label="EXPERIENCE">
          {c.experience.map((x) => (
            <div key={x.id} className="mb-3">
              <div className="flex justify-between">
                <span className="text-[12px] font-semibold">
                  {x.role}, {x.company}
                </span>
                <span className="font-mono text-[11px] text-[#555]">{x.period}</span>
              </div>
              <div className="mt-0.5 text-[11.5px] leading-relaxed text-[#333]">{x.desc}</div>
            </div>
          ))}
        </ResumeSec>
        <ResumeSec label="EDUCATION">
          {c.education.map((ed, i) => (
            <div key={i} className="flex justify-between text-[11.5px]">
              <span>
                <strong>{ed.school}</strong> — {ed.degree}
              </span>
              <span className="font-mono text-[#555]">{ed.period}</span>
            </div>
          ))}
        </ResumeSec>
        <ResumeSec label="SKILLS">
          <div className="text-[11.5px] leading-relaxed text-[#333]">
            {c.tags.join(" · ")}
          </div>
        </ResumeSec>
      </div>
    </div>
  );
}

function ResumeSec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[10px] font-bold tracking-[.12em] text-[#222]">{label}</div>
      {children}
    </div>
  );
}

function Activity({ c, onAskFindable }: { c: Candidate; onAskFindable: () => void }) {
  return (
    <div className="flex flex-col gap-2 px-5 pb-8 pt-4">
      <div className="relative">
        {c.activity.map((a, i) => (
          <div key={a.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <div className="h-2 w-2 rounded-full bg-text" />
              {i < c.activity.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-text">{a.text}</span>
                <span className="font-mono text-[11.5px] text-text-faint">{a.when}</span>
              </div>
              <div className="mt-0.5 text-[12px] text-text-mute">by {a.by}</div>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onAskFindable}
        className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-bg-elev text-[13px] text-text-mute hover:bg-bg-hover hover:text-text"
      >
        <Sparkle size={13} /> Ask findable about this candidate
      </button>
    </div>
  );
}