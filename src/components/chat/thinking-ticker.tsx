import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Streams the model's reasoning channel as a subtle "Thinking…" ticker.
 * While the assistant is still reasoning (no answer tokens yet), shows
 * the latest fragment of reasoning as fading rotating text. Once the
 * answer starts streaming or the turn ends, collapses to a small chip
 * the user can click to expand the full reasoning trace.
 */
export function ThinkingTicker({
  reasoning,
  active,
  answered,
  startedAt,
  endedAt,
}: {
  reasoning: string;
  /** True while this turn is still streaming (answer or reasoning). */
  active: boolean;
  /** True once the answer tokens have started arriving (collapse the ticker). */
  answered: boolean;
  startedAt: number;
  endedAt?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  // Latest "fragment" — last ~120 chars of reasoning, trimmed at a
  // sentence boundary when possible so it reads cleanly.
  const fragment = useMemo(() => extractTail(reasoning), [reasoning]);

  // Bump a key whenever the fragment "ticks" forward to a new sentence,
  // so the fade/slide CSS animation re-fires.
  const tickRef = useRef(0);
  const lastFragRef = useRef("");
  if (fragment !== lastFragRef.current) {
    tickRef.current += 1;
    lastFragRef.current = fragment;
  }

  // Show a live ticking duration while active so it feels alive.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const i = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(i);
  }, [active]);

  if (!reasoning && !active) return null;
  if (!reasoning && !answered) {
    // Active but no reasoning tokens yet — just the pill, no body.
    return <ThinkingPill label="Thinking" />;
  }

  const elapsedMs = (endedAt ?? now) - startedAt;
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));

  // Collapsed chip (answer is streaming or finished).
  if (answered) {
    if (!reasoning) return null;
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1",
            "text-[11.5px] text-text-mute transition hover:bg-muted/60 hover:text-text",
          )}
        >
          <Sparkle />
          <span>
            Thought for {seconds}s
          </span>
          <span className="text-text-faint group-hover:text-text-mute">
            · {expanded ? "hide" : "show"} reasoning {expanded ? "▴" : "▾"}
          </span>
        </button>
        {expanded && (
          <div
            className={cn(
              "max-h-64 overflow-y-auto rounded-md border border-border/60 bg-muted/20",
              "px-3 py-2 text-[12px] leading-relaxed text-text-mute",
              "animate-fade-in whitespace-pre-wrap",
            )}
          >
            {reasoning}
          </div>
        )}
      </div>
    );
  }

  // Live ticker: pill + last fragment fading through.
  return (
    <div className="space-y-1.5">
      <ThinkingPill label="Thinking" />
      {fragment && (
        <div className="relative h-[18px] overflow-hidden pl-1 text-[12px] leading-[18px] text-text-faint">
          <div
            key={tickRef.current}
            className="ticker-line truncate"
            title={fragment}
          >
            {fragment}
          </div>
        </div>
      )}
    </div>
  );
}

function ThinkingPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-muted/40 px-2.5 py-1 text-[11.5px] text-text-mute">
      <Sparkle />
      <span>{label}</span>
      <span className="flex items-center">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
    </div>
  );
}

function Sparkle() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      className="text-text-mute"
      aria-hidden
    >
      <path
        d="M6 0.75 L6.95 4.05 L10.25 5 L6.95 5.95 L6 9.25 L5.05 5.95 L1.75 5 L5.05 4.05 Z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}

/**
 * Returns the most recent ~120 characters of `text`, preferring to start
 * at a sentence boundary so the rolling text reads coherently.
 */
function extractTail(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 120) return clean;
  const tail = clean.slice(-200);
  // Start at the nearest sentence boundary in the tail (after .!?:).
  const m = tail.match(/[.!?:](\s+)([^.!?:]{12,})$/);
  if (m && m[2]) return m[2].trim().slice(0, 120);
  return tail.slice(-120).trim();
}