import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminCheck,
  listPrompts,
  listPartials,
  getPromptBySlug,
  getPartialBySlug,
  savePrompt,
  savePartial,
  previewPrompt,
  deletePrompt,
  deletePartial,
  listRevisions,
} from "@/lib/prompts/prompts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/prompts")({
  beforeLoad: async () => {
    try {
      await adminCheck();
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminPromptsPage,
});

type Kind = "prompt" | "partial";

function AdminPromptsPage() {
  const qc = useQueryClient();
  const lp = useServerFn(listPrompts);
  const lpa = useServerFn(listPartials);
  const gp = useServerFn(getPromptBySlug);
  const gpa = useServerFn(getPartialBySlug);
  const sp = useServerFn(savePrompt);
  const spa = useServerFn(savePartial);
  const pv = useServerFn(previewPrompt);
  const dp = useServerFn(deletePrompt);
  const dpa = useServerFn(deletePartial);
  const lr = useServerFn(listRevisions);

  const [kind, setKind] = useState<Kind>("prompt");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    slug: "",
    title: "",
    description: "",
    body: "",
    is_active: true,
  });
  const [preview, setPreview] = useState<string>("");

  const promptsQ = useQuery({ queryKey: ["admin", "prompts"], queryFn: () => lp() });
  const partialsQ = useQuery({ queryKey: ["admin", "partials"], queryFn: () => lpa() });

  const itemQ = useQuery({
    queryKey: ["admin", kind, selectedSlug],
    queryFn: async () => {
      if (!selectedSlug) return null;
      return kind === "prompt"
        ? await gp({ data: { slug: selectedSlug } })
        : await gpa({ data: { slug: selectedSlug } });
    },
    enabled: Boolean(selectedSlug),
  });

  useEffect(() => {
    if (itemQ.data) {
      const d = itemQ.data as {
        slug: string;
        title: string;
        description: string;
        body: string;
        is_active?: boolean;
      };
      setDraft({
        slug: d.slug,
        title: d.title ?? "",
        description: d.description ?? "",
        body: d.body ?? "",
        is_active: d.is_active ?? true,
      });
      setPreview("");
    }
  }, [itemQ.data]);

  const revisionsQ = useQuery({
    queryKey: ["admin", "revisions", (itemQ.data as { id?: string } | null)?.id],
    queryFn: () => lr({ data: { promptId: (itemQ.data as { id: string }).id } }),
    enabled: kind === "prompt" && Boolean((itemQ.data as { id?: string } | null)?.id),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (kind === "prompt") {
        return sp({ data: draft });
      }
      return spa({
        data: {
          slug: draft.slug,
          title: draft.title,
          description: draft.description,
          body: draft.body,
        },
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin"] });
      setSelectedSlug(draft.slug);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewMut = useMutation({
    mutationFn: () => pv({ data: { slug: draft.slug, vars: {} } }),
    onSuccess: (r) => setPreview(r.body),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!selectedSlug) return;
      return kind === "prompt"
        ? dp({ data: { slug: selectedSlug } })
        : dpa({ data: { slug: selectedSlug } });
    },
    onSuccess: () => {
      toast.success("Deleted");
      setSelectedSlug(null);
      setDraft({ slug: "", title: "", description: "", body: "", is_active: true });
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = useMemo(() => {
    return (kind === "prompt" ? promptsQ.data : partialsQ.data) ?? [];
  }, [kind, promptsQ.data, partialsQ.data]);

  function newItem() {
    setSelectedSlug(null);
    setDraft({ slug: "", title: "", description: "", body: "", is_active: true });
    setPreview("");
  }

  return (
    <div className="flex h-screen w-full bg-bg text-text">
      <aside className="flex w-72 flex-col border-r border-border bg-bg-side">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <Link to="/app" className="text-sm text-text-mute hover:text-text">
            ← Back to app
          </Link>
        </div>
        <div className="flex gap-1 p-2">
          <button
            onClick={() => {
              setKind("prompt");
              newItem();
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
              kind === "prompt" ? "bg-bg-active text-text" : "text-text-mute hover:bg-bg-hover"
            }`}
          >
            Prompts
          </button>
          <button
            onClick={() => {
              setKind("partial");
              newItem();
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
              kind === "partial" ? "bg-bg-active text-text" : "text-text-mute hover:bg-bg-hover"
            }`}
          >
            Partials
          </button>
        </div>
        <div className="px-2 pb-2">
          <Button variant="outline" size="sm" className="w-full" onClick={newItem}>
            + New {kind}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {items.map((it: { slug: string; title: string; version?: number; is_active?: boolean }) => (
            <button
              key={it.slug}
              onClick={() => setSelectedSlug(it.slug)}
              className={`w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition ${
                selectedSlug === it.slug
                  ? "bg-bg-active text-text"
                  : "text-text/90 hover:bg-bg-hover"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[12px]">{it.slug}</span>
                {kind === "prompt" && it.is_active === false && (
                  <span className="text-[10px] text-text-faint">off</span>
                )}
              </div>
              <div className="truncate text-[11px] text-text-faint">{it.title}</div>
            </button>
          ))}
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-text-faint">No {kind}s yet.</p>
          )}
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="border-b border-border px-6 py-4">
          <h1 className="text-lg font-semibold">
            {selectedSlug ? `Edit ${kind}` : `New ${kind}`}
          </h1>
          <p className="text-xs text-text-mute mt-0.5">
            Use <code className="font-mono">{`{{partial:slug}}`}</code> to include partials and{" "}
            <code className="font-mono">{`{{var:name}}`}</code> for runtime variables.
          </p>
        </div>

        <div className="flex-1 px-6 py-4 space-y-4 max-w-4xl">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Slug</Label>
              <Input
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder="namespace.name"
                className="font-mono"
                disabled={Boolean(selectedSlug)}
              />
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>

          {kind === "prompt" && (
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.is_active}
                onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
              />
              <Label className="!mb-0">Active</Label>
            </div>
          )}

          <div>
            <Label>Body</Label>
            <Textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="font-mono text-[12px] min-h-[400px]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !draft.slug}>
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
            {kind === "prompt" && selectedSlug && (
              <Button
                variant="outline"
                onClick={() => previewMut.mutate()}
                disabled={previewMut.isPending}
              >
                {previewMut.isPending ? "Rendering…" : "Preview expanded"}
              </Button>
            )}
            {selectedSlug && (
              <Button
                variant="ghost"
                className="text-destructive ml-auto"
                onClick={() => {
                  if (confirm(`Delete ${kind} "${selectedSlug}"?`)) deleteMut.mutate();
                }}
              >
                Delete
              </Button>
            )}
          </div>

          {preview && (
            <div>
              <Label>Preview</Label>
              <pre className="rounded-md border border-border bg-bg-input p-3 font-mono text-[12px] whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                {preview}
              </pre>
            </div>
          )}

          {kind === "prompt" && revisionsQ.data && revisionsQ.data.length > 0 && (
            <div>
              <Label>Revisions</Label>
              <div className="rounded-md border border-border divide-y divide-border text-[12px]">
                {revisionsQ.data.map((r) => (
                  <div key={r.id} className="flex justify-between px-3 py-2">
                    <span className="font-mono">v{r.version}</span>
                    <span className="text-text-mute">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}