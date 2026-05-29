import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getGmailConnection,
  startGmailConnect,
  disconnectGmail,
} from "@/lib/outreach/gmail.functions";
import { Send } from "@/components/findable-icons";

export function useGmailConnection() {
  const fn = useServerFn(getGmailConnection);
  return useQuery({
    queryKey: ["gmail-connection"],
    queryFn: () => fn({}),
  });
}

export function ConnectGmailButton({ label = "Connect Gmail to send" }: { label?: string }) {
  const start = useServerFn(startGmailConnect);
  const mut = useMutation({
    mutationFn: async () => {
      const returnUrl = `${window.location.origin}/oauth/google/return`;
      sessionStorage.setItem("google_oauth_return_to", window.location.pathname);
      sessionStorage.setItem("google_oauth_kind", "gmail");
      return start({ data: { returnUrl } });
    },
    onSuccess: ({ authorizationUrl }) => {
      window.location.href = authorizationUrl;
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to start Gmail connect"),
  });
  return (
    <button
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      className="flex h-9 items-center gap-1.5 rounded-lg bg-text px-3.5 text-[12.5px] font-medium text-text-invert transition hover:opacity-90 disabled:opacity-60"
    >
      <Send size={13} />
      {mut.isPending ? "Opening Google…" : label}
    </button>
  );
}

export function GmailConnectionPill() {
  const qc = useQueryClient();
  const { data } = useGmailConnection();
  const disconnectFn = useServerFn(disconnectGmail);
  const mut = useMutation({
    mutationFn: () => disconnectFn({}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gmail-connection"] });
      toast.success("Gmail disconnected");
    },
  });
  if (!data) return null;
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elev px-3 py-1 text-[11.5px] text-text-mute">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      <span className="text-text">{data.email}</span>
      <button onClick={() => mut.mutate()} className="text-text-faint hover:text-text">
        Disconnect
      </button>
    </div>
  );
}