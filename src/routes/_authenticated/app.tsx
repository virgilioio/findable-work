import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listConversations,
  createConversation,
  deleteConversation,
  renameConversation,
  setConversationPinned,
} from "@/lib/conversations.functions";
import { adminCheck } from "@/lib/prompts/prompts.functions";
import { useTheme } from "@/hooks/use-theme";
import {
  Logo,
  Wordmark,
  Plus,
  Search as SearchIcon,
  Dots,
  Chat as ChatIcon,
  Sun,
  Moon,
  LogOut,
  Pencil,
  Pin,
} from "@/components/findable-icons";
import { Trash2, PinOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

type Conv = {
  id: string;
  title: string;
  updated_at?: string;
  created_at?: string;
  pinned_at?: string | null;
};

function AppLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listConversations);
  const create = useServerFn(createConversation);
  const del = useServerFn(deleteConversation);
  const rename = useServerFn(renameConversation);
  const setPinned = useServerFn(setConversationPinned);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      if (conv) navigate({ to: "/app/c/$id", params: { id: conv.id } });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const renameMut = useMutation({
    mutationFn: (vars: { id: string; title: string }) =>
      rename({ data: vars }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", vars.id] });
    },
  });

  const pinMut = useMutation({
    mutationFn: (vars: { id: string; pinned: boolean }) =>
      setPinned({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.info("[auth] app auth state changed", { event, hasSession: Boolean(session) });
      if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && !session)) {
        qc.clear();
        // Use window.location to avoid any router-state races on hard sign-out.
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          console.info("[auth] redirecting to /login after sign-out or missing session");
          window.location.replace("/login");
        }
      } else if (event === "SIGNED_IN") {
        qc.invalidateQueries();
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeId = useActiveConversationId();
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState<string>("");
  const { theme, toggle } = useTheme();
  const adminCheckFn = useServerFn(adminCheck);
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      try {
        await adminCheckFn();
        return true;
      } catch {
        return false;
      }
    },
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations as Conv[];
    return (conversations as Conv[]).filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const groups = useMemo(() => groupConversations(filtered), [filtered]);

  const deletingConv = useMemo(
    () => (conversations as Conv[]).find((c) => c.id === deletingId),
    [conversations, deletingId],
  );

  async function onSignOut() {
    console.info("[auth] sign-out requested");
    await supabase.auth.signOut();
  }

  return (
    <div className="flex h-screen w-full bg-bg text-text">
      <aside
        className="flex flex-col border-r border-border bg-bg-side"
        style={{ width: "var(--side-w)" }}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <Link to="/app" className="flex items-center gap-2 text-text">
            <Wordmark height={36} />
          </Link>
        </div>

        {/* New project */}
        <div className="px-3 pb-2">
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="flex w-full items-center gap-2 rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] font-medium text-text shadow-[var(--shadow-sm)] transition hover:bg-bg-hover disabled:opacity-60"
          >
            <Plus size={16} />
            New project
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 rounded-[10px] bg-bg-input px-2.5 py-1.5">
            <SearchIcon size={14} className="text-text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-text-faint"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-text-faint">
              {query ? "No matches." : "No projects yet. Click + to start one."}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conv={c}
                    active={activeId === c.id}
                    renaming={renamingId === c.id}
                    renameDraft={renameDraft}
                    setRenameDraft={setRenameDraft}
                    onStartRename={() => {
                      setRenamingId(c.id);
                      setRenameDraft(c.title || "");
                    }}
                    onCancelRename={() => setRenamingId(null)}
                    onCommitRename={() => {
                      const t = renameDraft.trim();
                      if (t && t !== c.title) {
                        renameMut.mutate({ id: c.id, title: t });
                      }
                      setRenamingId(null);
                    }}
                    onTogglePin={() =>
                      pinMut.mutate({ id: c.id, pinned: !c.pinned_at })
                    }
                    onDelete={() => setDeletingId(c.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-text text-text-invert text-[11px] font-medium">
            {(email[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-text">{email || "Signed in"}</p>
          </div>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="rounded-md p-1.5 text-text-mute transition hover:bg-bg-hover hover:text-text"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            onClick={onSignOut}
            aria-label="Sign out"
            className="rounded-md p-1.5 text-text-mute transition hover:bg-bg-hover hover:text-text"
          >
            <LogOut size={14} />
          </button>
          {isAdmin && (
            <Link
              to="/admin/prompts"
              aria-label="Admin"
              className="rounded-md px-1.5 py-1 text-[11px] font-medium text-text-mute transition hover:bg-bg-hover hover:text-text"
            >
              Admin
            </Link>
          )}
          <button
            aria-label="More"
            className="rounded-md p-1.5 text-text-mute transition hover:bg-bg-hover hover:text-text"
          >
            <Dots size={14} />
          </button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden bg-bg">
        <Outlet />
      </main>

      <AlertDialog open={Boolean(deletingId)} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently eliminate <strong>"{deletingConv?.title || "Untitled"}"</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingId) {
                  // Only redirect when deleting the currently-open chat.
                  // Pick the chat immediately above it in the sidebar; if it's
                  // the first one, fall back to the next; if it's the only
                  // one, fall back to /app.
                  if (deletingId === activeId) {
                    const list = conversations as Conv[];
                    const idx = list.findIndex((c) => c.id === deletingId);
                    const neighbor =
                      idx > 0 ? list[idx - 1] : list[idx + 1] ?? null;
                    if (neighbor) {
                      navigate({ to: "/app/c/$id", params: { id: neighbor.id } });
                    } else {
                      navigate({ to: "/app" });
                    }
                  }
                  delMut.mutate(deletingId);
                }
                setDeletingId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function useActiveConversationId(): string | null {
  try {
    const params = useParams({ strict: false }) as { id?: string };
    return params.id ?? null;
  } catch {
    return null;
  }
}

function groupByDate(items: Conv[]): { label: string; items: Conv[] }[] {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const today = startOfDay(now);
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  const buckets: Record<string, Conv[]> = {
    Today: [],
    Yesterday: [],
    "Last 7 days": [],
    Earlier: [],
  };
  for (const c of items) {
    const t = new Date(c.updated_at ?? c.created_at ?? Date.now()).getTime();
    if (t >= today) buckets["Today"].push(c);
    else if (t >= yesterday) buckets["Yesterday"].push(c);
    else if (t >= weekAgo) buckets["Last 7 days"].push(c);
    else buckets["Earlier"].push(c);
  }
  return Object.entries(buckets)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, items]) => ({ label, items }));
}

function groupConversations(items: Conv[]): { label: string; items: Conv[] }[] {
  const pinned = items.filter((c) => c.pinned_at);
  const rest = items.filter((c) => !c.pinned_at);
  const groups = groupByDate(rest);
  if (pinned.length > 0) {
    pinned.sort(
      (a, b) =>
        new Date(b.pinned_at ?? 0).getTime() -
        new Date(a.pinned_at ?? 0).getTime(),
    );
    return [{ label: "Pinned", items: pinned }, ...groups];
  }
  return groups;
}

function ConversationRow({
  conv,
  active,
  renaming,
  renameDraft,
  setRenameDraft,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onTogglePin,
  onDelete,
}: {
  conv: Conv;
  active: boolean;
  renaming: boolean;
  renameDraft: string;
  setRenameDraft: (v: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pinned = Boolean(conv.pinned_at);

  return (
    <Link
      to="/app/c/$id"
      params={{ id: conv.id }}
      className={cn(
        "group flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-[13px] text-text/90 transition hover:bg-bg-hover",
        active && "bg-bg-active text-text",
      )}
      onClick={(e) => {
        if (renaming) e.preventDefault();
      }}
    >
      {pinned ? (
        <Pin size={14} className="shrink-0 text-text-faint" />
      ) : (
        <ChatIcon size={14} className="shrink-0 text-text-faint" />
      )}
      {renaming ? (
        <input
          autoFocus
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onClick={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancelRename();
            }
          }}
          onBlur={onCommitRename}
          className="flex-1 min-w-0 rounded bg-bg-input px-1.5 py-0.5 text-[13px] text-text outline-none ring-1 ring-border-strong"
        />
      ) : (
        <span className="flex-1 truncate">{conv.title || "Untitled"}</span>
      )}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Conversation options"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={cn(
              "rounded p-0.5 text-text-faint transition hover:bg-bg-active hover:text-text",
              menuOpen || active
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100",
            )}
          >
            <Dots size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onStartRename();
            }}
          >
            <Pencil size={14} />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onTogglePin();
            }}
          >
            {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin size={14} />}
            <span>{pinned ? "Unpin conversation" : "Pin conversation"}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Link>
  );
}
