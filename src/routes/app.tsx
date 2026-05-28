import { createFileRoute, Link, Outlet, redirect, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listConversations,
  createConversation,
  deleteConversation,
} from "@/lib/conversations.functions";
import { useTheme } from "@/hooks/use-theme";
import {
  Logo,
  Plus,
  Search as SearchIcon,
  Dots,
  Chat as ChatIcon,
  Sun,
  Moon,
  LogOut,
  XSm,
} from "@/components/gio-icons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

type Conv = { id: string; title: string; updated_at?: string; created_at?: string };

function AppLayout() {
  const router = useRouter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listConversations);
  const create = useServerFn(createConversation);
  const del = useServerFn(deleteConversation);

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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      router.invalidate();
      qc.invalidateQueries();
      if (!session) navigate({ to: "/login", replace: true });
    });
    return () => subscription.unsubscribe();
  }, [router, qc, navigate]);

  const activeId = useActiveConversationId();
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState<string>("");
  const { theme, toggle } = useTheme();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations as Conv[];
    return (conversations as Conv[]).filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  async function onSignOut() {
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
            <Logo size={22} />
            <span className="text-[15px] font-semibold tracking-tight">findable</span>
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
                  <Link
                    key={c.id}
                    to="/app/c/$id"
                    params={{ id: c.id }}
                    className={cn(
                      "group flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-[13px] text-text/90 transition hover:bg-bg-hover",
                      activeId === c.id && "bg-bg-active text-text",
                    )}
                  >
                    <ChatIcon size={14} className="shrink-0 text-text-faint" />
                    <span className="flex-1 truncate">{c.title || "Untitled"}</span>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm("Delete this conversation?")) delMut.mutate(c.id);
                      }}
                      className="rounded p-0.5 text-text-faint opacity-0 transition hover:bg-bg-active hover:text-text group-hover:opacity-100"
                    >
                      <XSm />
                    </button>
                  </Link>
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

  const buckets: Record<string, Conv[]> = { Today: [], Yesterday: [], "Last 7 days": [], Earlier: [] };
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
