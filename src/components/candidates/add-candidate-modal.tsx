import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createCandidate } from "@/lib/candidates.functions";
import { X, Doc, Edit, Sparkle, ArrowRight } from "@/components/findable-icons";
import { cn } from "@/lib/utils";

export function AddCandidateModal({
  conversationId,
  onClose,
  onAdded,
}: {
  conversationId: string;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createCandidate);
  const [method, setMethod] = useState<"resume" | "manual">("manual");
  const [form, setForm] = useState({ name: "", role: "", company: "", source: "LinkedIn", tags: "" });
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{ name: string; role: string; company: string; source: string; tags: string[]; match: number } | null>(null);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const mut = useMutation({
    mutationFn: (input: { name: string; role?: string; company?: string; source?: string; tags?: string[]; match?: number }) =>
      create({ data: { conversationId, ...input } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["candidates", conversationId] });
      onAdded((row as { id: string }).id);
    },
  });

  function simulateParse() {
    setParsing(true);
    setTimeout(() => {
      setParsing(false);
      setParsed({
        name: "Alejandra Solís",
        role: "Senior Sales Development Rep",
        company: "Kavak",
        source: "Resume upload",
        tags: ["Salesforce", "Outreach", "LATAM", "SaaS"],
        match: 86,
      });
    }, 1600);
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="fade-up flex max-h-[calc(100%-48px)] w-[520px] max-w-full flex-col overflow-auto rounded-[14px] border border-border bg-bg shadow-[var(--shadow-md)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pb-3.5 pt-4.5">
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Add candidate</div>
            <div className="mt-0.5 text-[12.5px] text-text-mute">Drop a resume or enter details manually</div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-text-mute hover:bg-bg-hover">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pb-3.5">
          {(["resume", "manual"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={cn(
                "flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-transparent text-[13px] text-text-mute",
                method === m && "border-text bg-bg-elev font-medium text-text",
              )}
            >
              {m === "resume" ? <Doc size={13} /> : <Edit size={13} />}
              {m === "resume" ? "Drop resume" : "Manual entry"}
            </button>
          ))}
        </div>

        {method === "resume" && (
          <div>
            {!parsed && !parsing && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  simulateParse();
                }}
                onClick={simulateParse}
                className={cn(
                  "mx-5 mb-5 flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-[1.5px] border-dashed px-6 py-10 text-center",
                  dragOver ? "border-text bg-bg-hover" : "border-border-strong bg-bg-elev",
                )}
              >
                <Doc size={28} className="text-text-mute" />
                <div className="mt-3 text-[14px] font-medium text-text">Drop a resume here</div>
                <div className="mt-1 text-[12.5px] text-text-mute">PDF, DOC, or DOCX · findable will parse name, role, skills and history</div>
                <button className="mt-3.5 h-[34px] rounded-lg border border-border-strong bg-bg-elev px-3.5 text-[13px] text-text">
                  Or browse files…
                </button>
              </div>
            )}
            {parsing && (
              <div className="mx-5 mb-5 flex flex-col items-center justify-center rounded-[10px] border border-border bg-bg-elev px-6 py-10">
                <div className="flex gap-1">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </div>
                <div className="mt-3.5 text-[13.5px] text-text">findable is parsing the resume…</div>
                <div className="mt-1 text-[12px] text-text-mute">Extracting experience, skills and contact details</div>
              </div>
            )}
            {parsed && (
              <div className="mx-5 mb-5 flex flex-col gap-3 rounded-[10px] border border-border bg-bg-elev p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-input text-[18px] font-semibold">
                    {parsed.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-semibold">{parsed.name}</div>
                    <div className="text-[13px] text-text-mute">{parsed.role} · {parsed.company}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-bg-input px-2 py-0.5 text-[11.5px] font-medium">
                    <Sparkle size={11} /> {parsed.match}% match
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {parsed.tags.map((t) => (
                    <span key={t} className="rounded bg-bg-input px-2 py-0.5 font-mono text-[11.5px] text-text-mute">{t}</span>
                  ))}
                </div>
                <div className="mt-1 flex justify-end gap-2 border-t border-border pt-3">
                  <button onClick={() => setParsed(null)} className="h-[34px] rounded-lg border border-border-strong bg-bg-elev px-3.5 text-[13px]">
                    Try another
                  </button>
                  <button
                    disabled={mut.isPending}
                    onClick={() =>
                      mut.mutate({
                        name: parsed.name,
                        role: parsed.role,
                        company: parsed.company,
                        source: parsed.source,
                        tags: parsed.tags,
                        match: parsed.match,
                      })
                    }
                    className="flex h-[34px] items-center gap-1.5 rounded-lg bg-text px-3.5 text-[13px] font-medium text-text-invert disabled:opacity-50"
                  >
                    Add to project <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {method === "manual" && (
          <div className="flex flex-col gap-2.5 px-5 pb-5">
            <Field label="Full name" required>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Alejandra Solís"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Current role">
                <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Senior SDR" className={inputCls} />
              </Field>
              <Field label="Company">
                <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Kavak" className={inputCls} />
              </Field>
            </div>
            <Field label="Source">
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputCls}>
                <option>LinkedIn</option>
                <option>Referral</option>
                <option>Talent pool</option>
                <option>Job board</option>
                <option>Inbound</option>
              </select>
            </Field>
            <Field label="Tags / skills" hint="Comma-separated">
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Salesforce, Outreach, LATAM" className={inputCls} />
            </Field>
            <div className="mt-1 flex justify-end gap-2 border-t border-border pt-3">
              <button onClick={onClose} className="h-[34px] rounded-lg border border-border-strong bg-bg-elev px-3.5 text-[13px]">
                Cancel
              </button>
              <button
                disabled={!form.name.trim() || mut.isPending}
                onClick={() =>
                  mut.mutate({
                    name: form.name.trim(),
                    role: form.role || undefined,
                    company: form.company || undefined,
                    source: form.source,
                    tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="flex h-[34px] items-center gap-1.5 rounded-lg bg-text px-3.5 text-[13px] font-medium text-text-invert disabled:opacity-40"
              >
                Add candidate <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "h-9 rounded-lg border border-border-strong bg-bg px-3 text-[13.5px] text-text outline-none";

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-[12px] font-medium text-text-mute">
        <span>
          {label}
          {required && <span className="text-text-faint"> *</span>}
        </span>
        {hint && <span className="text-[11px] font-normal text-text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}