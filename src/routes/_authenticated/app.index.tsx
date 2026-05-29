import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createConversation } from "@/lib/conversations.functions";
import { AppIcon, Plus } from "@/components/findable-icons";

export const Route = createFileRoute("/_authenticated/app/")({
  component: AppHome,
});

function AppHome() {
  const navigate = useNavigate();
  const create = useServerFn(createConversation);
  const mut = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (c) => c && navigate({ to: "/app/c/$id", params: { id: c.id } }),
  });
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-[520px] text-center">
        <AppIcon size={48} className="mx-auto mb-5" />
        <h1 className="text-[24px] font-semibold tracking-tight text-text">
          What hire can I help with?
        </h1>
        <p className="mt-2 text-[13px] text-text-mute">
          Start a project. As you describe the role, findable drafts a Job, then pipeline, posts, and more.
        </p>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-text px-4 py-2 text-[13px] font-medium text-text-invert transition hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={14} /> New project
        </button>
      </div>
    </div>
  );
}
