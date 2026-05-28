import { cn } from "@/lib/utils";
import { Check, Sparkle, Users, Search, Briefcase } from "@/components/gio-icons";

export type ChatTask = {
  id: string;
  message_id: string | null;
  kind: "normalize" | "research" | "search" | "collect" | "create_job" | string;
  label: string;
  status: "running" | "done" | "failed";
  summary: string | null;
  data?: Record<string, unknown>;
};

const KIND_ICON: Record<string, React.ReactNode> = {
  normalize: <Sparkle size={12} />,
  research: <Search size={12} />,
  search: <Search size={12} />,
  collect: <Users size={12} />,
  create_job: <Briefcase size={12} />,
};

export function TaskCard({ task }: { task: ChatTask }) {
  const running = task.status === "running";
  const failed = task.status === "failed";
  const done = task.status === "done";

  return (
    <div
      className={cn(
        "animate-fade-in flex items-start gap-2.5 rounded-lg border border-border bg-bg-elev px-3 py-2 text-[12.5px] transition",
        running && "border-border-strong",
        failed && "border-red-500/30 bg-red-500/5",
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
          done && "bg-emerald-500/15 text-emerald-500",
          running && "bg-bg-bubble text-text-mute",
          failed && "bg-red-500/15 text-red-500",
        )}
      >
        {done ? (
          <Check size={12} />
        ) : failed ? (
          <span className="text-[11px] font-bold">!</span>
        ) : (
          KIND_ICON[task.kind] ?? <Sparkle size={12} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("font-medium text-text", failed && "text-red-500")}>{task.label}</span>
          {running && (
            <span className="inline-flex items-center gap-0.5 text-text-faint">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </span>
          )}
        </div>
        {task.summary && (
          <div className={cn("mt-0.5 truncate text-[11.5px]", failed ? "text-red-500/80" : "text-text-mute")}>
            {task.summary}
          </div>
        )}
      </div>
    </div>
  );
}
