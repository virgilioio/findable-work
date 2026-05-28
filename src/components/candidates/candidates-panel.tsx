import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCandidates, updateCandidate } from "@/lib/candidates.functions";
import {
  Plus,
  Search,
  Star,
  Sparkle,
  Users,
  ChevDown,
} from "@/components/findable-icons";
import { cn } from "@/lib/utils";
import { CandidateDrawer, type Candidate } from "./candidate-drawer";
import { AddCandidateModal } from "./add-candidate-modal";

const STAGES = ["Sourced", "Contacted", "Screening", "Interview", "Offer"] as const;
type Stage = (typeof STAGES)[number];
type StageFilter = "All" | Stage;
type Sort = "match" | "recent" | "name";

export function CandidatesPanel({
  conversationId,
  onAskFindable,
}: {
  conversationId: string;
  onAskFindable: (prompt: string) => void;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listCandidates);
  const update = useServerFn(updateCandidate);
  const { data, isLoading } = useQuery({
    queryKey: ["candidates", conversationId],
    queryFn: () => list({ data: { conversationId } }),
  });
  const candidates = (data ?? []) as unknown as Candidate[];

  const [stage, setStage] = useState<StageFilter>("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("match");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: candidates.length };
    STAGES.forEach((s) => (c[s] = 0));
    candidates.forEach((x) => (c[x.stage] = (c[x.stage] || 0) + 1));
    return c;
  }, [candidates]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let rows = candidates.filter((c) => stage === "All" || c.stage === stage);
    if (ql) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(ql) ||
          c.role.toLowerCase().includes(ql) ||
          c.company.toLowerCase().includes(ql),
      );
    }
    rows = [...rows].sort((a, b) => {
      if (sort === "match") return b.match - a.match;
      if (sort === "name") return a.name.localeCompare(b.name);
      return 0;
    });
    return rows;
  }, [candidates, stage, q, sort]);

  const starMut = useMutation({
    mutationFn: (c: Candidate) => update({ data: { id: c.id, starred: !c.starred } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates", conversationId] }),
  });

  const opened = candidates.find((c) => c.id === openId) ?? null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Sub-header */}
      <div className="flex items-center justify-between border-b border-border bg-bg px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-bg-bubble text-text">
            <Users size={18} />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-text">
              Candidates
            </div>
            <div className="text-[12px] text-text-mute">
              {candidates.length} total · {counts.Interview ?? 0} in interview
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-text px-3 text-[12.5px] font-medium text-text-invert transition hover:opacity-90"
          >
            <Plus size={13} /> Add candidate
          </button>
        </div>
      </div>

      {/* Stage strip */}
      <div className="flex items-center gap-1 border-b border-border bg-bg px-5 py-2">
        {(["All", ...STAGES] as StageFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition",
              stage === s
                ? "bg-bg-bubble text-text"
                : "text-text-mute hover:bg-bg-hover hover:text-text",
            )}
          >
            {s}
            <span className="font-mono text-[10.5px] text-text-faint">
              {counts[s] ?? 0}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-2.5">
            <Search size={13} className="text-text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search candidates…"
              className="h-full w-[180px] bg-transparent text-[12.5px] outline-none placeholder:text-text-faint"
            />
          </div>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-8 appearance-none rounded-lg border border-border bg-bg-elev pl-2.5 pr-7 text-[12.5px] text-text outline-none"
            >
              <option value="match">Sort: Match</option>
              <option value="recent">Sort: Recent</option>
              <option value="name">Sort: Name</option>
            </select>
            <ChevDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-faint" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-text-faint">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onAdd={() => setAdding(true)} hasAny={candidates.length > 0} />
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-bg">
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-text-faint">
                <th className="px-5 py-2.5 font-medium">Candidate</th>
                <th className="px-3 py-2.5 font-medium">Stage</th>
                <th className="px-3 py-2.5 font-medium">Match</th>
                <th className="px-3 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Tags</th>
                <th className="w-10 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setOpenId(c.id)}
                  className="cursor-pointer border-b border-border transition hover:bg-bg-hover"
                >
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-input text-[12px] font-semibold text-text">
                        {c.avatar}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-text">{c.name}</div>
                        <div className="truncate text-[12px] text-text-mute">
                          {c.role} · {c.company}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev px-2 py-0.5 text-[11.5px] text-text">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          c.stage === "Offer" ? "bg-emerald-500" : "bg-text-mute",
                        )}
                      />
                      {c.stage}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-16 overflow-hidden rounded-sm bg-bg-input">
                        <div className="h-full bg-text" style={{ width: `${c.match}%` }} />
                      </div>
                      <span className="font-mono text-[11.5px] text-text-mute">{c.match}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-text-mute">{c.source}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => (
                        <span key={t} className="rounded bg-bg-input px-1.5 py-0.5 font-mono text-[10.5px] text-text-mute">
                          {t}
                        </span>
                      ))}
                      {c.tags.length > 3 && (
                        <span className="font-mono text-[10.5px] text-text-faint">+{c.tags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        starMut.mutate(c);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-text-faint hover:bg-bg-hover hover:text-text"
                    >
                      <Star size={14} fill={c.starred ? "currentColor" : "none"} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {opened && (
        <CandidateDrawer
          candidate={opened}
          onClose={() => setOpenId(null)}
          onAskFindable={(c) => {
            setOpenId(null);
            onAskFindable(`Tell me about ${c.name} — strengths, gaps, and a recommended next step for this role.`);
          }}
        />
      )}
      {adding && (
        <AddCandidateModal
          conversationId={conversationId}
          onClose={() => setAdding(false)}
          onAdded={(id) => {
            setAdding(false);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ onAdd, hasAny }: { onAdd: () => void; hasAny: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-bubble text-text">
        <Users size={22} />
      </div>
      <div className="mt-4 text-[15px] font-semibold text-text">
        {hasAny ? "No matches" : "No candidates yet"}
      </div>
      <div className="mt-1 max-w-[360px] text-[12.5px] text-text-mute">
        {hasAny
          ? "Try a different stage or search term."
          : "Add candidates manually, drop a resume, or ask findable to source profiles for you."}
      </div>
      {!hasAny && (
        <button
          onClick={onAdd}
          className="mt-4 flex h-9 items-center gap-1.5 rounded-lg bg-text px-3.5 text-[12.5px] font-medium text-text-invert"
        >
          <Plus size={13} /> Add candidate
        </button>
      )}
    </div>
  );
}