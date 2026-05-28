import { cn } from "@/lib/utils";
import { Briefcase, Users, ArrowRight, Megaphone } from "@/components/findable-icons";
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

export type ArtifactTab = "job" | "candidates" | "job_posts";

const ARTIFACT_BY_KIND: Record<string, { tab: ArtifactTab; icon: React.ReactNode; subtitle: string }> = {
  create_job: { tab: "job", icon: <Briefcase size={14} />, subtitle: "Open Job tab to review" },
  collect: { tab: "candidates", icon: <Users size={14} />, subtitle: "Open Candidates tab to review" },
  create_job_posts: { tab: "job_posts", icon: <Megaphone size={14} />, subtitle: "Open Job Posts tab to review" },
};

export function TaskCard({
  task,
  onOpenTab,
  onSubmitClarify,
  clarifyAnswered,
  clarifyAnswers,
}: {
  task: ChatTask;
  onOpenTab?: (tab: ArtifactTab) => void;
  onSubmitClarify?: (taskId: string, formatted: string, answers: Record<string, string[]>) => void;
  clarifyAnswered?: boolean;
  clarifyAnswers?: Record<string, string[]>;
}) {
  const running = task.status === "running";
  const failed = task.status === "failed";
  const done = task.status === "done";

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
