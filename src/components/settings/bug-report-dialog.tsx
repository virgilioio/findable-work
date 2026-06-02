import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { sendBugReport } from "@/lib/bug-report.functions";

export function BugReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [description, setDescription] = useState("");
  const sendFn = useServerFn(sendBugReport);

  const mut = useMutation({
    mutationFn: (text: string) =>
      sendFn({
        data: {
          description: text,
          pageUrl:
            typeof window !== "undefined" ? window.location.href : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Bug report sent — thank you!");
      setDescription("");
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error((e as Error).message || "Couldn't send bug report"),
  });

  const canSubmit = description.trim().length > 0 && !mut.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && mut.isPending) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a bug</DialogTitle>
          <DialogDescription>
            Tell us what went wrong. We'll get back to you at the email you
            signed up with.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 4000))}
          placeholder="What happened? What did you expect to happen?"
          className="min-h-[160px]"
          autoFocus
        />
        <div className="text-right text-[11px] text-text-faint">
          {description.length}/4000
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate(description.trim())}
            disabled={!canSubmit}
          >
            {mut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              "Send report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}