import { useEffect, useMemo, useState } from "react";
import {
  Settings as SettingsIcon,
  Bell,
  Sparkles,
  Plug,
  Database,
  Shield,
  User as UserIcon,
  LifeBuoy,
  Mail,
  Calendar as CalendarIcon,
  CheckCircle2,
  X,
  Search as SearchIcon,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import {
  getGmailConnection,
  startGmailConnect,
  disconnectGmail,
} from "@/lib/outreach/gmail.functions";
import {
  getCalendarConnection,
  startCalendarConnect,
  disconnectCalendar,
} from "@/lib/outreach/calendar.functions";

export type SettingsSection =
  | "general"
  | "notifications"
  | "personalization"
  | "connections"
  | "data"
  | "security"
  | "account"
  | "help";

const SECTIONS: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "personalization", label: "Personalization", icon: Sparkles },
  { id: "connections", label: "Connections", icon: Plug },
  { id: "data", label: "Data controls", icon: Database },
  { id: "security", label: "Security", icon: Shield },
  { id: "account", label: "Account", icon: UserIcon },
  { id: "help", label: "Help", icon: LifeBuoy },
];

function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const update = (v: T) => {
    setVal(v);
    try {
      window.localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* noop */
    }
  };
  return [val, update];
}

export function SettingsDialog({
  open,
  section,
  onOpenChange,
}: {
  open: boolean;
  section: SettingsSection | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [active, setActive] = useState<SettingsSection>(section ?? "general");

  useEffect(() => {
    if (open && section) setActive(section);
  }, [open, section]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[600px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your preferences, integrations and account.
        </DialogDescription>
        <div className="flex h-full">
          {/* Rail */}
          <aside className="w-56 shrink-0 border-r border-border bg-bg-side py-4">
            <div className="px-4 pb-3 text-[13px] font-semibold text-text">
              Settings
            </div>
            <nav className="space-y-0.5 px-2">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const on = active === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActive(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-text/90 transition hover:bg-bg-hover",
                      on && "bg-bg-active text-text",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <header className="flex h-12 items-center justify-between border-b border-border px-5">
              <h2 className="text-[14px] font-semibold text-text">
                {SECTIONS.find((s) => s.id === active)?.label}
              </h2>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {active === "general" && <GeneralPane />}
              {active === "notifications" && <NotificationsPane />}
              {active === "personalization" && <PersonalizationPane />}
              {active === "connections" && <ConnectionsPane />}
              {active === "data" && <DataPane />}
              {active === "security" && <SecurityPane onClose={() => onOpenChange(false)} />}
              {active === "account" && <AccountPane />}
              {active === "help" && <HelpPane />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Helpers -------------------------------- */

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-text">{label}</div>
        {description && (
          <div className="mt-0.5 text-[12px] text-text-mute">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 mt-5 text-[11px] font-medium uppercase tracking-wide text-text-faint first:mt-0">
      {children}
    </div>
  );
}

/* -------------------------------- General -------------------------------- */

function GeneralPane() {
  const { theme, toggle } = useTheme();
  const [showSidebar, setShowSidebar] = usePersistedState<boolean>(
    "findable:show-sidebar",
    true,
  );
  const [language, setLanguage] = usePersistedState<string>(
    "findable:language",
    "en",
  );

  return (
    <div>
      <Row label="Appearance" description="Light or dark theme.">
        <Select value={theme} onValueChange={() => toggle()}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Accent" description="Color used for primary actions.">
        <span className="rounded-full border border-border bg-bg-input px-2.5 py-0.5 text-[11.5px] text-text-mute">
          Monochrome
        </span>
      </Row>
      <Row label="Show sidebar" description="Toggle the conversation sidebar.">
        <Switch checked={showSidebar} onCheckedChange={setShowSidebar} />
      </Row>
      <Row label="Language" description="Interface language.">
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="es">Español</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </div>
  );
}

/* ----------------------------- Notifications ----------------------------- */

type Notifications = {
  applicants: boolean;
  replies: boolean;
  interviews: boolean;
  digest: boolean;
  mentions: boolean;
};
const DEFAULT_NOTIF: Notifications = {
  applicants: true,
  replies: true,
  interviews: true,
  digest: false,
  mentions: true,
};

function NotificationsPane() {
  const [n, setN] = usePersistedState<Notifications>(
    "findable:notifications",
    DEFAULT_NOTIF,
  );
  const set = (k: keyof Notifications) => (v: boolean) => setN({ ...n, [k]: v });
  return (
    <div>
      <Row label="New applicants" description="When someone applies to a job post.">
        <Switch checked={n.applicants} onCheckedChange={set("applicants")} />
      </Row>
      <Row label="Replies" description="When a candidate replies to outreach.">
        <Switch checked={n.replies} onCheckedChange={set("replies")} />
      </Row>
      <Row label="Interview reminders" description="15 minutes before an interview.">
        <Switch checked={n.interviews} onCheckedChange={set("interviews")} />
      </Row>
      <Row label="Daily digest" description="A morning recap of pipeline activity.">
        <Switch checked={n.digest} onCheckedChange={set("digest")} />
      </Row>
      <Row label="Mentions" description="When a teammate @mentions you.">
        <Switch checked={n.mentions} onCheckedChange={set("mentions")} />
      </Row>
    </div>
  );
}

/* ---------------------------- Personalization ---------------------------- */

type Personalization = {
  assistantName: string;
  tone: "friendly" | "professional" | "direct";
  autoPersonalize: boolean;
  regions: string[];
  signature: string;
};
const DEFAULT_PERSONAL: Personalization = {
  assistantName: "Findable",
  tone: "professional",
  autoPersonalize: true,
  regions: ["LATAM"],
  signature: "",
};
const REGIONS = ["LATAM", "US", "EU", "APAC"];

function PersonalizationPane() {
  const [p, setP] = usePersistedState<Personalization>(
    "findable:personalization",
    DEFAULT_PERSONAL,
  );
  const toggleRegion = (r: string) => {
    const next = p.regions.includes(r)
      ? p.regions.filter((x) => x !== r)
      : [...p.regions, r];
    setP({ ...p, regions: next });
  };
  return (
    <div>
      <Row label="Assistant name" description="How the assistant refers to itself.">
        <Input
          value={p.assistantName}
          onChange={(e) => setP({ ...p, assistantName: e.target.value })}
          className="h-8 w-[200px]"
        />
      </Row>
      <Row label="Outreach tone" description="Default writing style for emails.">
        <Select
          value={p.tone}
          onValueChange={(v) => setP({ ...p, tone: v as Personalization["tone"] })}
        >
          <SelectTrigger className="h-8 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="friendly">Friendly</SelectItem>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="direct">Direct</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row
        label="Auto-personalize"
        description="Insert candidate-specific details into outreach drafts."
      >
        <Switch
          checked={p.autoPersonalize}
          onCheckedChange={(v) => setP({ ...p, autoPersonalize: v })}
        />
      </Row>
      <div className="border-b border-border py-3">
        <div className="text-[13px] font-medium text-text">Sourcing regions</div>
        <div className="mt-0.5 text-[12px] text-text-mute">
          Default regions when sourcing candidates.
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {REGIONS.map((r) => {
            const on = p.regions.includes(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRegion(r)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[12px] transition",
                  on
                    ? "border-text bg-text text-text-invert"
                    : "border-border bg-bg-input text-text-mute hover:bg-bg-hover",
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>
      <div className="py-3">
        <div className="text-[13px] font-medium text-text">Email signature</div>
        <div className="mt-0.5 text-[12px] text-text-mute">
          Appended to outreach emails.
        </div>
        <Textarea
          value={p.signature}
          onChange={(e) => setP({ ...p, signature: e.target.value })}
          className="mt-2 min-h-[90px]"
          placeholder={"Best,\nYour name"}
        />
      </div>
    </div>
  );
}

/* ----------------------------- Connections ------------------------------ */

function ConnectionsPane() {
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-text-mute">
        Connect your own Google account so Findable can send emails and read your
        calendar on your behalf.
      </p>
      <GmailRow />
      <CalendarRow />
    </div>
  );
}

function ConnectionCard({
  icon,
  title,
  description,
  connectedEmail,
  onConnect,
  onDisconnect,
  busy,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  connectedEmail: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  busy?: boolean;
}) {
  const connected = Boolean(connectedEmail);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-bg-elev p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-input text-text">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[13.5px] font-semibold text-text">{title}</h3>
          {connected && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] text-text-mute">{description}</p>
        {connected && (
          <p className="mt-1 truncate text-[12px] text-text">{connectedEmail}</p>
        )}
      </div>
      <div className="shrink-0">
        {connected ? (
          <button
            onClick={onDisconnect}
            disabled={busy}
            className="rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px] text-text transition hover:bg-bg-hover disabled:opacity-60"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={busy}
            className="rounded-lg bg-text px-3 py-1.5 text-[12.5px] font-medium text-text-invert transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Opening Google…" : "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}

function GmailRow() {
  const qc = useQueryClient();
  const getFn = useServerFn(getGmailConnection);
  const startFn = useServerFn(startGmailConnect);
  const disFn = useServerFn(disconnectGmail);
  const { data } = useQuery({
    queryKey: ["gmail-connection"],
    queryFn: () => getFn({}),
  });
  const startMut = useMutation({
    mutationFn: async () => {
      const returnUrl = `${window.location.origin}/oauth/google/return`;
      sessionStorage.setItem("google_oauth_return_to", window.location.pathname);
      sessionStorage.setItem("google_oauth_kind", "gmail");
      return startFn({ data: { returnUrl } });
    },
    onSuccess: ({ authorizationUrl }) => {
      window.location.href = authorizationUrl;
    },
    onError: (e: any) => toast.error(friendlyOAuthError(e, "Gmail")),
  });
  const disMut = useMutation({
    mutationFn: () => disFn({}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gmail-connection"] });
      toast.success("Gmail disconnected");
    },
  });
  return (
    <ConnectionCard
      icon={<Mail className="h-5 w-5" />}
      title="Gmail"
      description="Send outreach emails and read replies from your inbox."
      connectedEmail={data?.email ?? null}
      onConnect={() => startMut.mutate()}
      onDisconnect={() => disMut.mutate()}
      busy={startMut.isPending || disMut.isPending}
    />
  );
}

function CalendarRow() {
  const qc = useQueryClient();
  const getFn = useServerFn(getCalendarConnection);
  const startFn = useServerFn(startCalendarConnect);
  const disFn = useServerFn(disconnectCalendar);
  const { data } = useQuery({
    queryKey: ["calendar-connection"],
    queryFn: () => getFn({}),
  });
  const startMut = useMutation({
    mutationFn: async () => {
      const returnUrl = `${window.location.origin}/oauth/google/return`;
      sessionStorage.setItem("google_oauth_return_to", window.location.pathname);
      sessionStorage.setItem("google_oauth_kind", "calendar");
      return startFn({ data: { returnUrl } });
    },
    onSuccess: ({ authorizationUrl }) => {
      window.location.href = authorizationUrl;
    },
    onError: (e: any) => toast.error(friendlyOAuthError(e, "Calendar")),
  });
  const disMut = useMutation({
    mutationFn: () => disFn({}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-connection"] });
      toast.success("Calendar disconnected");
    },
  });
  return (
    <ConnectionCard
      icon={<CalendarIcon className="h-5 w-5" />}
      title="Google Calendar"
      description="Show your availability and schedule interviews with candidates."
      connectedEmail={data?.email ?? null}
      onConnect={() => startMut.mutate()}
      onDisconnect={() => disMut.mutate()}
      busy={startMut.isPending || disMut.isPending}
    />
  );
}

/* ------------------------------ Data controls ----------------------------- */

function DataPane() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <div>
      <Row label="Export data" description="Download your conversations and candidates.">
        <button
          disabled
          className="rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px] text-text-mute opacity-60"
        >
          Export
        </button>
      </Row>
      <Row
        label="Delete workspace data"
        description="Permanently remove all workspace data. This cannot be undone."
      >
        <button
          onClick={() => setConfirmOpen(true)}
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12.5px] font-medium text-destructive transition hover:bg-destructive/15"
        >
          Delete data
        </button>
      </Row>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace data?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletion requests are handled by our team. Please contact support at
              support@findable.work to proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.location.href = "mailto:support@findable.work?subject=Delete%20workspace%20data";
              }}
            >
              Contact support
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------- Security -------------------------------- */

function SecurityPane({ onClose }: { onClose: () => void }) {
  const [twofa, setTwofa] = usePersistedState<boolean>("findable:2fa", false);
  const signOutAll = async () => {
    await supabase.auth.signOut({ scope: "global" });
    onClose();
  };
  const changePassword = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email) {
      toast.error("No email on account");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(data.user.email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  };
  return (
    <div>
      <Row
        label="Two-factor authentication"
        description="Require a second factor at sign-in."
      >
        <Switch checked={twofa} onCheckedChange={setTwofa} />
      </Row>
      <Row
        label="Change password"
        description="Send a password reset email to your account."
      >
        <button
          onClick={changePassword}
          className="rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px] text-text transition hover:bg-bg-hover"
        >
          Send email
        </button>
      </Row>
      <Row
        label="Active sessions"
        description="Devices currently signed in to this account."
      >
        <span className="text-[12px] text-text-mute">1 active</span>
      </Row>
      <Row
        label="Log out all devices"
        description="End every signed-in session, including this one."
      >
        <button
          onClick={signOutAll}
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12.5px] font-medium text-destructive transition hover:bg-destructive/15"
        >
          Log out all
        </button>
      </Row>
    </div>
  );
}

/* -------------------------------- Account -------------------------------- */

function AccountPane() {
  const [email, setEmail] = useState<string>("");
  const [name, setName] = usePersistedState<string>("findable:display-name", "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);
  const initial = (name || email || "?")[0]?.toUpperCase() ?? "?";
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-text text-[16px] font-semibold text-text-invert">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-text">
            {name || email || "Account"}
          </div>
          <div className="truncate text-[12px] text-text-mute">{email}</div>
        </div>
      </div>
      <Row label="Display name" description="Shown to your teammates.">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-[220px]"
          placeholder="Your name"
        />
      </Row>
      <Row label="Email" description="Used for sign-in and notifications.">
        <span className="text-[12.5px] text-text-mute">{email || "—"}</span>
      </Row>
      <Row label="Role" description="Your access level in this workspace.">
        <span className="text-[12.5px] text-text-mute">Owner</span>
      </Row>
      <Row label="Seats" description="Members in this workspace.">
        <span className="text-[12.5px] text-text-mute">1 of 1</span>
      </Row>
      <Row
        label="Delete account"
        description="Permanently delete your account and all data."
      >
        <button
          onClick={() => setConfirmOpen(true)}
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12.5px] font-medium text-destructive transition hover:bg-destructive/15"
        >
          Delete account
        </button>
      </Row>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Account deletion is handled by our team. Email support@findable.work and
              we'll process the request within one business day.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.location.href = "mailto:support@findable.work?subject=Delete%20my%20account";
              }}
            >
              Contact support
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------------------------- Help ---------------------------------- */

const HELP_ARTICLES = [
  { title: "Getting started with Findable", excerpt: "Create your first project and source candidates." },
  { title: "Connecting Gmail", excerpt: "Send outreach from your own inbox." },
  { title: "Connecting Google Calendar", excerpt: "Schedule interviews directly from a conversation." },
  { title: "Sourcing candidates", excerpt: "Use natural-language search to find the right people." },
  { title: "Outreach automation", excerpt: "Personalize messages at scale with auto-personalize." },
  { title: "Billing and plans", excerpt: "Manage your subscription, seats and invoices." },
  { title: "Privacy and data controls", excerpt: "How we store and protect your data." },
];

function HelpPane() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return HELP_ARTICLES;
    return HELP_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(s) || a.excerpt.toLowerCase().includes(s),
    );
  }, [q]);
  return (
    <div>
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help articles"
          className="h-9 pl-8"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-faint hover:text-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-4 space-y-1.5">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] text-text-mute">
            No articles found.
          </p>
        ) : (
          filtered.map((a) => (
            <div
              key={a.title}
              className="cursor-pointer rounded-lg border border-border bg-bg-elev p-3 transition hover:bg-bg-hover"
            >
              <div className="text-[13px] font-medium text-text">{a.title}</div>
              <div className="mt-0.5 text-[12px] text-text-mute">{a.excerpt}</div>
            </div>
          ))
        )}
      </div>
      <div className="mt-5 flex items-center justify-between rounded-lg border border-border bg-bg-side p-3">
        <div className="text-[12.5px] text-text-mute">
          Need a hand? Our team usually replies within a few hours.
        </div>
        <a
          href="mailto:support@findable.work"
          className="rounded-lg bg-text px-3 py-1.5 text-[12.5px] font-medium text-text-invert transition hover:opacity-90"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}