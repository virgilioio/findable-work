import { createFileRoute, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Wordmark, Folder, Check as CheckIcon, Sparkle, Doc, X } from "@/components/findable-icons";
import { cn } from "@/lib/utils";
import { getPublicJob } from "@/lib/public-jobs.functions";
import { Markdown } from "@/components/ui/markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Screening = Array<{
  id: string;
  type: "select" | "multi" | "textarea";
  question: string;
  options?: string[];
  required: boolean;
}>;

type PublicJob = {
  id: string;
  slug: string;
  title: string;
  company: string | null;
  location: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  summary: string | null;
  description: string | null;
  requirements: string[] | null;
  responsibilities: string[] | null;
  must_have: string[] | null;
  nice_to_have: string[] | null;
  screening: Screening | null;
  published: boolean;
  published_at: string | null;
};

export const Route = createFileRoute("/jobs/$slug")({
  loader: async ({ params }) => {
    const job = (await getPublicJob({ data: { slug: params.slug } })) as PublicJob | null;
    if (!job) throw notFound();
    return { job };
  },
  head: ({ loaderData }) => {
    const j = loaderData?.job;
    const title = j ? `${j.title}${j.company ? ` — ${j.company}` : ""} | Apply` : "Apply | findable";
    const desc = j?.summary?.slice(0, 160) || "Apply to this role.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: ApplyPage,
  notFoundComponent: NotLive,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-bg-side px-4 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold">Couldn't load this posting</h1>
        <p className="mt-2 text-sm text-text-mute">{error.message}</p>
      </div>
    </div>
  ),
});

function NotLive() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-side px-4">
      <div className="max-w-md rounded-2xl border border-border bg-bg-elev p-8 text-center shadow-sm">
        <Folder size={32} className="mx-auto text-text-faint" />
        <h1 className="mt-4 text-[18px] font-semibold">This posting isn't live yet</h1>
        <p className="mt-1.5 text-[13.5px] text-text-mute">
          The job needs to be published from the findable workspace before applications open.
        </p>
      </div>
    </div>
  );
}

function ApplyPage() {
  const { job } = Route.useLoaderData();
  const [form, setForm] = useState<{
    name: string;
    email: string;
    phone: string;
    linkedin: string;
    location: string;
    resume_filename: string;
    resume_path: string;
    resume_size: number;
    resume_mime: string;
    answers: Record<string, string | string[]>;
  }>({
    name: "",
    email: "",
    phone: "",
    linkedin: "",
    location: "",
    resume_filename: "",
    resume_path: "",
    resume_size: 0,
    resume_mime: "",
    answers: {},
  });
  const [errors, setErrors] = useState<Record<string, true>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const screening: Screening = job.screening ?? [];

  function setAnswer(qid: string, val: string | string[]) {
    setForm((f) => ({ ...f, answers: { ...f.answers, [qid]: val } }));
  }
  function toggleMulti(qid: string, opt: string) {
    setForm((f) => {
      const cur = Array.isArray(f.answers[qid]) ? (f.answers[qid] as string[]) : [];
      const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
      return { ...f, answers: { ...f.answers, [qid]: next } };
    });
  }

  function validate(): boolean {
    const e: Record<string, true> = {};
    if (!form.name.trim()) e.name = true;
    if (!form.email.trim() || !/@/.test(form.email)) e.email = true;
    for (const q of screening) {
      if (!q.required) continue;
      const a = form.answers[q.id];
      if (a === undefined || a === "" || (Array.isArray(a) && a.length === 0)) e[q.id] = true;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/public/jobs/${encodeURIComponent(job.slug)}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          linkedin: form.linkedin,
          location: form.location,
          resume_filename: form.resume_filename || undefined,
          resume_path: form.resume_path || undefined,
          resume_size: form.resume_size || undefined,
          resume_mime: form.resume_mime || undefined,
          answers: form.answers,
        }),
      });
      if (res.status === 429) {
        setSubmitError("Looks like you already submitted — give it a minute.");
        return;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        setSubmitError(`Couldn't submit (${res.status}). ${txt.slice(0, 200)}`);
        return;
      }
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err?.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-side px-4">
        <div className="max-w-md rounded-2xl border border-border bg-bg-elev p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckIcon size={22} />
          </div>
          <h1 className="mt-4 text-[18px] font-semibold">Application received</h1>
          <p className="mt-1.5 text-[13.5px] text-text-mute">
            Thanks, {form.name.split(" ")[0]}. The team at{" "}
            {job.company || "this company"} will review your application and reach out if there's a fit.
          </p>
        </div>
      </div>
    );
  }

  const compLabel = (() => {
    if (job.salary_min && job.salary_max)
      return `${job.currency || "USD"} ${job.salary_min.toLocaleString()}–${job.salary_max.toLocaleString()}`;
    if (job.salary_min) return `${job.currency || "USD"} ${job.salary_min.toLocaleString()}+`;
    return null;
  })();

  return (
    <div className="min-h-screen bg-bg-side text-text">
      <header className="sticky top-0 z-10 border-b border-border bg-bg-elev/90 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between">
          <Wordmark height={20} />
          <span className="text-[12px] text-text-faint">Powered by findable</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1100px] gap-8 px-6 py-10 lg:grid-cols-[1fr_420px]">
        {/* JD */}
        <article className="space-y-8">
          <header>
            <div className="text-[12px] uppercase tracking-wide text-text-faint">
              {job.company || "Company"}
            </div>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">{job.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-text-mute">
              {job.location && <span>{job.location}</span>}
              {job.employment_type && <span>· {job.employment_type.replace("_", "-")}</span>}
              {compLabel && <span>· {compLabel}</span>}
            </div>
          </header>

          {(job.summary || job.description) && (
            <section>
              <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                About the role
              </h2>
              <Markdown className="text-[14.5px]">
                {job.summary || job.description || ""}
              </Markdown>
            </section>
          )}

          {job.responsibilities && job.responsibilities.length > 0 && (
            <ListSection title="What you'll do" items={job.responsibilities} />
          )}

          {((job.must_have && job.must_have.length) || (job.requirements && job.requirements.length)) && (
            <ListSection
              title="What we're looking for"
              items={(job.must_have && job.must_have.length ? job.must_have : job.requirements) || []}
            />
          )}

          {job.nice_to_have && job.nice_to_have.length > 0 && (
            <ListSection title="Nice to have" items={job.nice_to_have} />
          )}
        </article>

        {/* Form */}
        <aside className="lg:sticky lg:top-[72px] lg:self-start">
          <form
            onSubmit={submit}
            className="space-y-5 rounded-2xl border border-border bg-bg-elev p-5 shadow-sm"
          >
            <h2 className="text-[15px] font-semibold">Apply for this role</h2>

            <Field label="Full name" required error={errors.name}>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
                placeholder="Jane Doe"
              />
            </Field>
            <Field label="Email" required error={errors.email}>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls}
                placeholder="jane@example.com"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Location">
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="LinkedIn">
              <input
                value={form.linkedin}
                onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                className={inputCls}
                placeholder="linkedin.com/in/…"
              />
            </Field>
            <Field label="Resume">
              <ResumeDrop
                filename={form.resume_filename}
                size={form.resume_size}
                onUploaded={(f) =>
                  setForm((prev) => ({
                    ...prev,
                    resume_filename: f.filename,
                    resume_path: f.path,
                    resume_size: f.size,
                    resume_mime: f.mime,
                  }))
                }
                onClear={() =>
                  setForm((prev) => ({
                    ...prev,
                    resume_filename: "",
                    resume_path: "",
                    resume_size: 0,
                    resume_mime: "",
                  }))
                }
              />
            </Field>

            {screening.length > 0 && (
              <>
                <div className="flex items-center gap-2 border-t border-border pt-4">
                  <Sparkle size={12} className="text-text-faint" />
                  <span className="text-[11px] uppercase tracking-wide text-text-faint">
                    A few role-specific questions
                  </span>
                </div>
                {screening.map((q) => (
                  <Field key={q.id} label={q.question} required={q.required} error={errors[q.id]}>
                    {q.type === "select" && (
                      <div className="flex flex-wrap gap-1.5">
                        {(q.options || []).map((opt) => {
                          const active = form.answers[q.id] === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setAnswer(q.id, opt)}
                              className={cn(
                                "rounded-full border px-3 py-1 text-[12.5px] transition",
                                active
                                  ? "border-text bg-text text-text-invert"
                                  : "border-border bg-bg-elev text-text hover:bg-bg-hover",
                              )}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {q.type === "multi" && (
                      <div className="flex flex-wrap gap-1.5">
                        {(q.options || []).map((opt) => {
                          const cur = Array.isArray(form.answers[q.id])
                            ? (form.answers[q.id] as string[])
                            : [];
                          const active = cur.includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggleMulti(q.id, opt)}
                              className={cn(
                                "rounded-full border px-3 py-1 text-[12.5px] transition",
                                active
                                  ? "border-text bg-text text-text-invert"
                                  : "border-border bg-bg-elev text-text hover:bg-bg-hover",
                              )}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {q.type === "textarea" && (
                      <textarea
                        value={(form.answers[q.id] as string) || ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        rows={4}
                        className={cn(inputCls, "min-h-[88px]")}
                      />
                    )}
                  </Field>
                ))}
              </>
            )}

            {submitError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-10 w-full items-center justify-center rounded-lg bg-text text-[13.5px] font-medium text-text-invert transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">{title}</h2>
      <ul className="list-disc space-y-1 pl-5 text-[14.5px] leading-relaxed">
        {items.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </section>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-bg-elev px-3 text-[13.5px] outline-none transition focus:border-border-strong";

function formatBytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPTED_MIMES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function ResumeDrop({
  filename,
  size,
  onUploaded,
  onClear,
}: {
  filename: string;
  size: number;
  onUploaded: (f: { filename: string; path: string; size: number; mime: string }) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const mime = ACCEPTED_MIMES[ext];
    if (!mime) {
      toast.error("Please upload a PDF, DOC, or DOCX file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is too large (10 MB max)");
      return;
    }
    setUploading(true);
    try {
      const id = crypto.randomUUID();
      const path = `pending/${id}.${ext}`;
      const { error } = await supabase.storage.from("resumes").upload(path, file, {
        contentType: mime,
        upsert: false,
      });
      if (error) {
        toast.error(error.message || "Upload failed");
        return;
      }
      onUploaded({ filename: file.name, path, size: file.size, mime });
    } finally {
      setUploading(false);
    }
  }

  if (filename && !uploading) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-bg-input px-3.5 py-2.5">
        <Doc size={16} className="text-text-mute" />
        <span className="flex-1 truncate text-[13px] text-text">{filename}</span>
        {size > 0 && (
          <span className="font-mono text-[11.5px] text-text-faint">{formatBytes(size)}</span>
        )}
        <button
          type="button"
          onClick={onClear}
          className="flex h-6 w-6 items-center justify-center rounded text-text-mute hover:bg-bg-hover"
          aria-label="Remove resume"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !uploading && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !uploading) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!uploading) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (uploading) return;
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-[1.5px] border-dashed px-4 py-5 text-center transition",
        drag ? "border-text bg-bg-input" : "border-border-strong bg-bg-elev hover:bg-bg-input",
        uploading && "pointer-events-none opacity-70",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <Doc size={20} className="text-text-mute" />
      <div className="mt-1.5 text-[13px] text-text">
        {uploading ? (
          "Uploading…"
        ) : (
          <>
            Drop your resume or <span className="underline">browse</span>
          </>
        )}
      </div>
      <div className="mt-0.5 text-[11.5px] text-text-faint">PDF, DOC or DOCX · up to 10 MB</div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={cn("mb-1 block text-[12.5px] font-medium", error ? "text-red-600" : "text-text")}>
        {label} {required && <span className="text-text-faint">*</span>}
      </label>
      {children}
    </div>
  );
}