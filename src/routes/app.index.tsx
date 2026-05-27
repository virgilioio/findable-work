import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createConversation } from "@/lib/conversations.functions";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/")({
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
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <Sparkles className="mx-auto h-10 w-10 text-primary" />
        <h1 className="text-2xl font-semibold">Your recruiting copilot</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Start a conversation. As you describe the role and what you need, the AI builds out
          workspace tabs — starting with the Job, then pipeline, posts, and more.
        </p>
      </div>
      <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
        New conversation
      </Button>
    </div>
  );
}