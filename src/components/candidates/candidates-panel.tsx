import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listCandidates, updateCandidate } from "@/lib/candidates.functions";
import { sourceMore } from "@/lib/sourcing/source-more.functions";
import {
  Plus,
  Search,
  Star,
  Sparkle,
  Users,
  ChevDown,
  ArrowRight,
} from "@/components/findable-icons";
import { cn } from "@/lib/utils";
import { CandidateDrawer, type Candidate } from "./candidate-drawer";
import { AddCandidateModal } from "./add-candidate-modal";
import { ContactAutomation } from "@/components/outreach/contact-automation";

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
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contacting, setContacting] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [conversationId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: candidates.length };
    STAGES.forEach((s) => (c[s] = 0));
    candidates.forEach((x) => (c[x.stage] = (c[x.stage] || 0) + 1));
    return c;
  }, [candidates]);

  const flaggedCount = useMemo(
    () => candidates.filter((c) => c.starred).length,
    [candidates],
  );

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let rows = candidates.filter((c) => stage === "All" || c.stage === stage);
    if (flaggedOnly) rows = rows.filter((c) => c.starred);
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
  }, [candidates, stage, q, sort, flaggedOnly]);

  const starMut = useMutation({
    mutationFn: (c: Candidate) => update({ data: { id: c.id, starred: !c.starred } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates", conversationId] }),
  });

  const sourceMoreFn = useServerFn(sourceMore);
  const sourceMoreMut = useMutation({
    mutationFn: () => sourceMoreFn({ data: { conversationId, limit: 10 } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["candidates", conversationId] });
      if (res.added > 0) {
        toast.success(`${res.added} candidate${res.added === 1 ? "" : "s"} sourced`);
      } else if (res.exhausted) {
        toast("No more matches — refine the brief in chat.");
      } else {
        toast("No new candidates added.");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Source more failed"),
  });

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const someVisibleSelected =
    !allVisibleSelected && filtered.some((c) => selectedIds.has(c.id));

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filtered.forEach((c) => next.delete(c.id));
      } else {
        filtered.forEach((c) => next.add(c.id));
      }
      return next;
    });
  };
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 text-[12.5px] font-medium text-text transition hover:bg-bg-hover"
          >
            <Plus size={13} /> Add
          </button>
          <button
            onClick={() => sourceMoreMut.mutate()}
            disabled={sourceMoreMut.isPending}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 text-[12.5px] font-medium text-text transition hover:bg-bg-hover disabled:opacity-60"
          >
            <Sparkle size={13} />
            {sourceMoreMut.isPending ? "Sourcing…" : "Source more"}
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setContacting(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-text px-3 text-[12.5px] font-medium text-text-invert transition hover:opacity-90"
            >
              Contact ( {selectedIds.size} ) <ArrowRight size={13} />
            </button>
          )}
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
          <button
            onClick={() => setFlaggedOnly((v) => !v)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition",
              flaggedOnly
                ? "border-border bg-bg-bubble text-text"
                : "border-border bg-bg-elev text-text-mute hover:text-text",
            )}
          >
            <Star size={13} fill={flaggedOnly ? "currentColor" : "none"} />
            Flagged
            <span className="font-mono text-[10.5px] text-text-faint">{flaggedCount}</span>
          </button>
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
                <th className="w-10 pl-5 pr-2 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    onChange={toggleAllVisible}
                    className="h-3.5 w-3.5 cursor-pointer accent-text"
                  />
                </th>
                <th className="px-2 py-2.5 font-medium">Candidate</th>
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
                  <td className="w-10 pl-5 pr-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.name}`}
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                      className="h-3.5 w-3.5 cursor-pointer accent-text"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-input text-[12px] font-semibold text-text">
                        {c.avatar}
                      </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate font-medium text-text">
                            <span className="truncate">{c.name}</span>
                            {c.starred && <Star size={13} fill="currentColor" className="shrink-0 text-text-mute" />}
                            {c.has_direct_phone && (
                              <span
                                title="Direct phone available — reveal in profile"
                                className="inline-flex shrink-0 items-center rounded-full bg-bg-input px-1.5 py-[1px] text-[10px] font-medium text-text-mute"
                              >
                                📞
                              </span>
                            )}
                          </div>
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