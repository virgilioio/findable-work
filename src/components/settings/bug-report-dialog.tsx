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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendBugReport } from "@/lib/bug-report.functions";

const AREAS = [
  "General",
  "Chat",
  "Job & posts",
  "Sourcing",
  "Candidates",
  "Outreach",
  "Interviews",
  "Billing & credits",
] as const;
type Area = (typeof AREAS)[number];

export function BugReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [area, setArea] = useState<Area>("General");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [includeTech, setIncludeTech] = useState(true);
  const sendFn = useServerFn(sendBugReport);

  const mut = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          area,
          summary: summary.trim(),
          description: description.trim(),
          includeTech,
          ...(includeTech && typeof window !== "undefined"
            ? {
                pageUrl: window.location.href,
                userAgent: window.navigator.userAgent,
                clientTimestamp: new Date().toISOString(),
              }
            : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Bug report sent — thank you!");
      setArea("General");
      setSummary("");
      setDescription("");
      setIncludeTech(true);
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error((e as Error).message || "Couldn't send bug report"),
  });

  const canSubmit =
    summary.trim().length > 0 &&
    description.trim().length > 0 &&
    !mut.isPending;

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
            Tell us what went wrong — it goes straight to support@findable.work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bug-area">Area</Label>
            <Select value={area} onValueChange={(v) => setArea(v as Area)}>
              <SelectTrigger id="bug-area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bug-summary">Summary</Label>
            <Input
              id="bug-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value.slice(0, 140))}
              placeholder="A short title for the issue"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bug-description">What happened?</Label>
            <Textarea
              id="bug-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 4000))}
              placeholder="What did you do, what did you expect, and what happened instead?"
              className="min-h-[140px]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <Checkbox
              checked={includeTech}
              onCheckedChange={(v) => setIncludeTech(v === true)}
            />
            Include technical details (page, browser, timestamp)
          </label>
        </div>

        <DialogFooter className="sm:justify-between sm:items-center gap-3">
          <p className="text-xs text-text-faint">
            Goes to <span className="font-mono">support@findable.work</span>
          </p>
          <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}