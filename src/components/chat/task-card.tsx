import { cn } from "@/lib/utils";
import { Briefcase, Users, ArrowRight, Megaphone, Send } from "@/components/findable-icons";
import { ClarifyCard, type ClarifyData } from "./clarify-card";

export type ChatTask = {
  id: string;
  message_id: string | null;
  kind: "normalize" | "research" | "search" | "collect" | "create_job" | "clarify" | string;
  label: string;
  status: "running" | "done" | "failed";
  summary: string | null;
  data?: Record<string, unknown>;
};

export type ArtifactTab = "job" | "candidates" | "job_posts" | "outreach";

const ARTIFACT_BY_KIND: Record<string, { tab: ArtifactTab; icon: React.ReactNode; subtitle: string }> = {
  create_job: { tab: "job", icon: <Briefcase size={14} />, subtitle: "Open Job tab to review" },
  collect: { tab: "candidates", icon: <Users size={14} />, subtitle: "Open Candidates tab to review" },
  create_job_posts: { tab: "job_posts", icon: <Megaphone size={14} />, subtitle: "Open Job Posts tab to review" },
  create_outreach: { tab: "outreach", icon: <Send size={14} />, subtitle: "Open Outreach tab to review" },
};

export type ProposalStep = {
  key: "job_posts" | "outreach";
  title: string;
  subtitle: string;
  recommended?: boolean;
};

const PROPOSAL_ICON: Record<ProposalStep["key"], React.ReactNode> = {
  job_posts: <Megaphone size={14} />,
  outreach: <Send size={14} />,
};

const PROPOSAL_PROMPT: Record<ProposalStep["key"], string> = {
  job_posts: "Draft the job posts for this role.",
  outreach: "Set up the outreach messages for the shortlist.",
};

export function TaskCard({
  task,
  onOpenTab,
  onSubmitClarify,
  clarifyAnswered,
  clarifyAnswers,
  onProposalClick,
  proposalInteractive,
  proposalDisabled,
}: {
  task: ChatTask;
  onOpenTab?: (tab: ArtifactTab) => void;
  onSubmitClarify?: (taskId: string, formatted: string, answers: Record<string, string[]>) => void;
  clarifyAnswered?: boolean;
  clarifyAnswers?: Record<string, string[]>;
  onProposalClick?: (step: ProposalStep, prompt: string) => void;
  proposalInteractive?: boolean;
  proposalDisabled?: boolean;
}) {
  const running = task.status === "running";
  const failed = task.status === "failed";
  const done = task.status === "done";

  if (task.kind === "proposal") {
    // Older proposal cards collapse — only the most recent one is shown.
    if (!proposalInteractive) return null;
    const data = (task.data ?? {}) as { steps?: ProposalStep[] };
    const steps = Array.isArray(data.steps) ? data.steps : [];
    if (steps.length === 0) {
      return (
        <div className="animate-fade-in text-[13px] text-text-mute">
          ✓ Everything's set up — tell me what to refine.
        </div>
      );
    }
    return (
      <div className="animate-fade-in space-y-2">
        <div className="text-[12px] font-medium uppercase tracking-wide text-text-faint">
          Suggested next steps
        </div>
        <div className="space-y-1.5">
          {steps.map((step) => (
            <button
              key={step.key}
              type="button"
              disabled={proposalDisabled}
              onClick={() => onProposalClick?.(step, PROPOSAL_PROMPT[step.key])}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl border border-border bg-bg-elev px-3.5 py-3 text-left transition",
                "hover:border-border-strong hover:bg-bg-hover",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-bg-elev",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-bubble text-text-mute">
                {PROPOSAL_ICON[step.key]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium text-text">{step.title}</span>
                  {step.recommended && (
                    <span className="rounded-full bg-text px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-bg">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="block truncate text-[12px] text-text-mute">{step.subtitle}</span>
              </span>
              <span className="text-text-faint transition group-hover:translate-x-0.5 group-hover:text-text">
                <ArrowRight size={14} />
              </span>
            </button>
          ))}
        </div>
        <div className="text-[11.5px] text-text-faint">
          Pick one, or just tell me what you'd like to do.
        </div>
      </div>
    );
  }

  if (task.kind === "clarify") {
    const data = (task.data ?? {}) as ClarifyData;
    if (!Array.isArray(data.questions) || data.questions.length === 0) return null;
    return (
      <ClarifyCard
        data={data}
        answered={clarifyAnswered}
        answers={clarifyAnswers}
        onSubmit={(formatted, answers) => onSubmitClarify?.(task.id, formatted, answers)}
      />
    );
  }

  const artifact = done ? ARTIFACT_BY_KIND[task.kind] : undefined;

  // Inline (non-artifact) task: just a single text line, no card chrome.
  if (!artifact) {
    return (
      <div
        className={cn(
          "animate-fade-in flex items-center gap-2 text-[13px]",
          failed ? "text-red-500/90" : running ? "text-text-mute" : "text-text-mute",
        )}
      >
        <span className={cn(failed ? "text-red-500" : "text-text")}>{task.label}</span>
        {running && (
          <span className="inline-flex items-center gap-0.5">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </span>
        )}
        {task.summary && !running && (
          <span className="text-text-faint">· {task.summary}</span>
        )}
      </div>
    );
  }

  // Artifact card — clickable, switches workspace tab.
  return (
    <button
      type="button"
      onClick={() => onOpenTab?.(artifact.tab)}
      className="animate-fade-in group flex w-full items-center gap-3 rounded-xl border border-border bg-bg-elev px-3.5 py-3 text-left transition hover:border-border-strong hover:bg-bg-hover"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-bubble text-text-mute">
        {artifact.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-text">{task.label}</span>
        <span className="block truncate text-[12px] text-text-mute">{artifact.subtitle}</span>
      </span>
      <span className="text-text-faint transition group-hover:translate-x-0.5 group-hover:text-text">
        <ArrowRight size={14} />
      </span>
    </button>
  );
}
