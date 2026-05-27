import { createFileRoute, Link, Outlet, redirect, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listConversations,
  createConversation,
  deleteConversation,
} from "@/lib/conversations.functions";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2, LogOut } from "lucide-react";
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

  async function onSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex items-center justify-between p-3">
          <Link to="/app" className="text-sm font-semibold">
            Recruit AI
          </Link>
          <Button size="sm" variant="ghost" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              No conversations yet. Click + to start one.
            </p>
          )}
          {conversations.map((c) => (
            <Link
              key={c.id}
              to="/app/c/$id"
              params={{ id: c.id }}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
                activeId === c.id && "bg-sidebar-accent",
              )}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="flex-1 truncate">{c.title}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm("Delete this conversation?")) delMut.mutate(c.id);
                }}
                className="opacity-0 transition group-hover:opacity-60 hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Link>
          ))}
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden">
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