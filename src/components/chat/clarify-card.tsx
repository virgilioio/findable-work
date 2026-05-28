import { useState } from "react";
import { cn } from "@/lib/utils";

export type ClarifyQuestion = {
  id: string;
  label: string;
  type: "single" | "multi" | "text";
  options: string[];
  placeholder?: string;
  allow_other?: boolean;
};

export type ClarifyData = {
  intro?: string;
  questions: ClarifyQuestion[];
};

export function ClarifyCard({
  data,
  answered,
  answers,
  onSubmit,
}: {
  data: ClarifyData;
  answered?: boolean;
  answers?: Record<string, string[]>;
  onSubmit?: (formatted: string, answers: Record<string, string[]>) => void;
}) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});

  function toggle(qid: string, opt: string, multi: boolean) {
    setSelections((prev) => {
      const cur = prev[qid] ?? [];
      if (!multi) return { ...prev, [qid]: cur[0] === opt ? [] : [opt] };
      return cur.includes(opt)
        ? { ...prev, [qid]: cur.filter((x) => x !== opt) }
        : { ...prev, [qid]: [...cur, opt] };
    });
  }

  function buildAnswers(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const q of data.questions) {
      const picks = [...(selections[q.id] ?? [])];
      const t = (texts[q.id] ?? "").trim();
      if (t) picks.push(t);
      if (picks.length) out[q.id] = picks;
    }
    return out;
  }

  const complete = data.questions.every((q) => {
    const picks = selections[q.id] ?? [];
    const t = (texts[q.id] ?? "").trim();
    return picks.length > 0 || t.length > 0;
  });

  function submit() {
    const ans = buildAnswers();
    const lines = data.questions
      .filter((q) => ans[q.id]?.length)
      .map((q) => `- **${q.label}** ${ans[q.id].join(", ")}`);
    const formatted = lines.join("\n");
    onSubmit?.(formatted, ans);
  }

  if (answered) {
    return (
      <div className="animate-fade-in rounded-xl border border-border bg-bg-elev px-3.5 py-3">
        {data.intro && <div className="mb-2 text-[12.5px] text-text-mute">{data.intro}</div>}
        <ul className="space-y-1">
          {data.questions.map((q) => {
            const picks = answers?.[q.id] ?? [];
            if (!picks.length) return null;
            return (
              <li key={q.id} className="text-[12.5px]">
                <span className="text-text-mute">{q.label} </span>
                <span className="text-text">{picks.join(", ")}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-3 rounded-xl border border-border bg-bg-elev px-3.5 py-3">
      {data.intro && <div className="text-[12.5px] text-text-mute">{data.intro}</div>}
      {data.questions.map((q) => {
        const picks = selections[q.id] ?? [];
        const multi = q.type === "multi";
        return (
          <div key={q.id} className="space-y-2">
            <div className="text-[13px] font-medium text-text">{q.label}</div>
            {q.type !== "text" && q.options.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const on = picks.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggle(q.id, opt, multi)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12px] transition",
                        on
                          ? "border-text bg-text text-text-invert"
                          : "border-border bg-bg text-text-mute hover:bg-bg-hover hover:text-text",
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
            {(q.type === "text" || q.allow_other) && (
              <input
                type="text"
                value={texts[q.id] ?? ""}
                onChange={(e) => setTexts((p) => ({ ...p, [q.id]: e.target.value }))}
                placeholder={q.placeholder || (q.type === "text" ? "Type your answer…" : "Other…")}
                className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-text-faint focus:border-border-strong"
              />
            )}
          </div>
        );
      })}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={!complete}
          className="rounded-full bg-text px-3.5 py-1.5 text-[12px] font-medium text-text-invert transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Send answers
        </button>
      </div>
    </div>
  );
}