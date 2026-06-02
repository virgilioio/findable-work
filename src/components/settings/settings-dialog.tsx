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
  Eye,
  CreditCard,
  Loader2,
  TrendingDown,
  TrendingUp,
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
import {
  getNotificationPrefs,
  updateNotificationPrefs,
} from "@/lib/notifications.functions";
import { getCreditsSummary } from "@/lib/billing/credits.functions";
import { createCheckoutSession } from "@/lib/billing/checkout.functions";
import { openBillingPortal } from "@/lib/billing/portal.functions";
import { getProfile, updateDisplayName, updatePersonalization } from "@/lib/profile.functions";
import { exportCandidatesCsv } from "@/lib/data-export.functions";
import { deleteOwnAccount } from "@/lib/account.functions";
import { wipeOwnTestData } from "@/lib/data-wipe.functions";
import { LANGUAGES, useLanguage } from "@/lib/i18n";

export type SettingsSection =
  | "general"
  | "notifications"
  | "personalization"
  | "connections"
  | "billing"
  | "data"
  | "security"
  | "account"
  | "help";

const SECTION_DEFS: {
  id: SettingsSection;
  labelKey: string;
  labelFallback: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "general", labelKey: "settings.general", labelFallback: "General", icon: SettingsIcon },
  { id: "notifications", labelKey: "settings.notifications", labelFallback: "Notifications", icon: Bell },
  { id: "personalization", labelKey: "settings.personalization", labelFallback: "Personalization", icon: Sparkles },
  { id: "connections", labelKey: "settings.connections", labelFallback: "Connections", icon: Plug },
  { id: "billing", labelKey: "settings.billing", labelFallback: "Usage & billing", icon: CreditCard },
  { id: "data", labelKey: "settings.data", labelFallback: "Data controls", icon: Database },
  { id: "security", labelKey: "settings.security", labelFallback: "Security", icon: Shield },
  { id: "account", labelKey: "settings.account", labelFallback: "Account", icon: UserIcon },
  { id: "help", labelKey: "settings.help", labelFallback: "Help", icon: LifeBuoy },
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
  const { t } = useLanguage();
  const sections = SECTION_DEFS.map((s) => ({ ...s, label: t(s.labelKey, s.labelFallback) }));

  useEffect(() => {
    if (open && section) setActive(section);
  }, [open, section]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[600px] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">{t("settings.title", "Settings")}</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your preferences, integrations and account.
        </DialogDescription>
        <div className="flex flex-1 min-h-0">
          {/* Rail */}
          <aside className="w-56 shrink-0 border-r border-border bg-bg-side py-4">
            <div className="px-4 pb-3 text-[13px] font-semibold text-text">
              {t("settings.title", "Settings")}
            </div>
            <nav className="space-y-0.5 px-2">
              {sections.map((s) => {
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
          <div className="flex flex-1 min-w-0 min-h-0 flex-col overflow-hidden">
            <header className="flex h-12 items-center justify-between border-b border-border px-5">
              <h2 className="text-[14px] font-semibold text-text">
                {sections.find((s) => s.id === active)?.label}
              </h2>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
              {active === "general" && <GeneralPane />}
              {active === "notifications" && <NotificationsPane />}
              {active === "personalization" && <PersonalizationPane />}
              {active === "connections" && <ConnectionsPane />}
              {active === "billing" && <BillingPane />}
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
  const { lang, setLang, t } = useLanguage();

  return (
    <div>
      <Row label={t("settings.appearance", "Appearance")} description={t("settings.appearance.desc", "Light or dark theme.")}>
        <Select value={theme} onValueChange={() => toggle()}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">{t("settings.appearance.light", "Light")}</SelectItem>
            <SelectItem value="dark">{t("settings.appearance.dark", "Dark")}</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label={t("settings.accent", "Accent")} description={t("settings.accent.desc", "Color used for primary actions.")}>
        <span className="rounded-full border border-border bg-bg-input px-2.5 py-0.5 text-[11.5px] text-text-mute">
          {t("settings.accent.value", "Monochrome")}
        </span>
      </Row>
      <Row
        label={t("settings.language", "Language")}
        description={t(
          "settings.language.desc",
          "Interface language. AI-generated content auto-adapts to whatever language you write in.",
        )}
      >
        <Select value={lang} onValueChange={(v) => setLang(v as never)}>
          <SelectTrigger className="h-8 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
    </div>
  );
}

/* ----------------------------- Notifications ----------------------------- */

function NotificationsPane() {
  const { t } = useLanguage();
  // Server-backed prefs (drive real emails).
  const getPrefs = useServerFn(getNotificationPrefs);
  const updPrefs = useServerFn(updateNotificationPrefs);
  const qc = useQueryClient();
  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-prefs"],
    queryFn: () => getPrefs({}),
  });
  const mut = useMutation({
    mutationFn: (next: { notifyOnNewApplicant: boolean; notifyDailyDigest: boolean }) =>
      updPrefs({ data: next }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["notification-prefs"] });
      const prev = qc.getQueryData(["notification-prefs"]);
      qc.setQueryData(["notification-prefs"], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notification-prefs"], ctx.prev);
      toast.error(t("settings.notif.error", "Couldn't save notification preferences"));
    },
    onSuccess: () => toast.success(t("settings.notif.saved", "Notification preferences saved")),
  });
  const applicants = prefs?.notifyOnNewApplicant ?? true;
  const digest = prefs?.notifyDailyDigest ?? false;
  const busy = isLoading || mut.isPending;

  return (
    <div>
      <Row
        label={t("settings.notif.applicants", "New applicants")}
        description={t("settings.notif.applicants.desc", "Email me as soon as someone applies to one of my job posts.")}
      >
        <Switch
          checked={applicants}
          disabled={busy}
          onCheckedChange={(v) =>
            mut.mutate({ notifyOnNewApplicant: v, notifyDailyDigest: digest })
          }
        />
      </Row>
      <Row
        label={t("settings.notif.digest", "Daily digest")}
        description={t("settings.notif.digest.desc", "One morning recap of new applicants from the last 24 hours.")}
      >
        <Switch
          checked={digest}
          disabled={busy}
          onCheckedChange={(v) =>
            mut.mutate({ notifyOnNewApplicant: applicants, notifyDailyDigest: v })
          }
        />
      </Row>
    </div>
  );
}

/* ---------------------------- Personalization ---------------------------- */

const REGIONS = ["LATAM", "US", "EU", "APAC"];

function PersonalizationPane() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const getProfileFn = useServerFn(getProfile);
  const updateFn = useServerFn(updatePersonalization);
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfileFn(),
  });

  const [draft, setDraft] = useState({
    companyName: "",
    companyWebsite: "",
    companyOneLiner: "",
    companyDescription: "",
    hiringContext: "",
    userRole: "",
    sourcingRegions: [] as string[],
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!profile || hydrated) return;
    setDraft({
      companyName: profile.companyName ?? "",
      companyWebsite: profile.companyWebsite ?? "",
      companyOneLiner: profile.companyOneLiner ?? "",
      companyDescription: profile.companyDescription ?? "",
      hiringContext: profile.hiringContext ?? "",
      userRole: profile.userRole ?? "",
      sourcingRegions: profile.sourcingRegions ?? [],
    });
    setHydrated(true);
  }, [profile, hydrated]);

  const mut = useMutation({
    mutationFn: (patch: Partial<typeof draft>) => updateFn({ data: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error((e as Error).message || t("settings.pers.save_error", "Couldn't save")),
  });

  const commit = (patch: Partial<typeof draft>) => mut.mutate(patch);

  const toggleRegion = (r: string) => {
    const next = draft.sourcingRegions.includes(r)
      ? draft.sourcingRegions.filter((x) => x !== r)
      : [...draft.sourcingRegions, r];
    setDraft({ ...draft, sourcingRegions: next });
    commit({ sourcingRegions: next });
  };

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-text-mute">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading", "Loading…")}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="mb-3 text-[12.5px] text-text-mute">
        {t("settings.pers.intro", "Tell Findable about you and your company. The AI uses this to draft outreach, job posts, and replies that actually sound like you.")}
      </p>
      <Row label={t("settings.pers.role", "Your role")} description={t("settings.pers.role.desc", "e.g. Head of Talent, Founder.")}>
        <Input
          value={draft.userRole}
          onChange={(e) => setDraft({ ...draft, userRole: e.target.value })}
          onBlur={() => commit({ userRole: draft.userRole })}
          className="h-8 w-[260px]"
          placeholder="Head of Talent"
        />
      </Row>
      <Row label={t("settings.pers.company", "Company name")} description={t("settings.pers.company.desc", "The company you're hiring for.")}>
        <Input
          value={draft.companyName}
          onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
          onBlur={() => commit({ companyName: draft.companyName })}
          className="h-8 w-[260px]"
          placeholder="Acme Inc."
        />
      </Row>
      <Row label={t("settings.pers.website", "Company website")} description={t("settings.pers.website.desc", "Public URL.")}>
        <Input
          value={draft.companyWebsite}
          onChange={(e) => setDraft({ ...draft, companyWebsite: e.target.value })}
          onBlur={() => commit({ companyWebsite: draft.companyWebsite })}
          className="h-8 w-[260px]"
          placeholder="https://acme.com"
        />
      </Row>
      <div className="border-b border-border py-3">
        <div className="text-[13px] font-medium text-text">{t("settings.pers.oneliner", "One-liner")}</div>
        <div className="mt-0.5 text-[12px] text-text-mute">
          {t("settings.pers.oneliner.desc", "A single sentence that captures what the company does.")}
        </div>
        <Input
          value={draft.companyOneLiner}
          onChange={(e) => setDraft({ ...draft, companyOneLiner: e.target.value })}
          onBlur={() => commit({ companyOneLiner: draft.companyOneLiner })}
          className="mt-2 h-8 w-full"
          placeholder="We help SMBs run payroll in one click."
        />
      </div>
      <div className="border-b border-border py-3">
        <div className="text-[13px] font-medium text-text">{t("settings.pers.about", "About the company")}</div>
        <div className="mt-0.5 text-[12px] text-text-mute">
          {t("settings.pers.about.desc", "Mission, product, team, culture — anything the AI should weave into outreach and job posts.")}
        </div>
        <Textarea
          value={draft.companyDescription}
          onChange={(e) => setDraft({ ...draft, companyDescription: e.target.value })}
          onBlur={() => commit({ companyDescription: draft.companyDescription })}
          className="mt-2 min-h-[110px]"
          placeholder="We're a 40-person remote team building payroll software for small businesses in LATAM…"
        />
      </div>
      <div className="border-b border-border py-3">
        <div className="text-[13px] font-medium text-text">{t("settings.pers.hiring", "Hiring context")}</div>
        <div className="mt-0.5 text-[12px] text-text-mute">
          {t("settings.pers.hiring.desc", "What you typically hire for: roles, seniority, locations, must-haves.")}
        </div>
        <Textarea
          value={draft.hiringContext}
          onChange={(e) => setDraft({ ...draft, hiringContext: e.target.value })}
          onBlur={() => commit({ hiringContext: draft.hiringContext })}
          className="mt-2 min-h-[90px]"
          placeholder="Mostly senior backend engineers (Go/Rust), LATAM-remote, fluent English."
        />
      </div>
      <div className="py-3">
        <div className="text-[13px] font-medium text-text">{t("settings.pers.regions", "Sourcing regions")}</div>
        <div className="mt-0.5 text-[12px] text-text-mute">
          {t("settings.pers.regions.desc", "Default regions when sourcing candidates.")}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {REGIONS.map((r) => {
            const on = draft.sourcingRegions.includes(r);
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
    </div>
  );
}

/* ----------------------------- Connections ------------------------------ */

function ConnectionsPane() {
  const { t } = useLanguage();
  const [previewKind, setPreviewKind] = useState<"gmail" | "calendar" | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-text-mute">
        {t("settings.conn.intro", "Connect your own Google account so Findable can send emails and read your calendar on your behalf.")}
      </p>
      <GmailRow onPreview={() => setPreviewKind("gmail")} />
      <CalendarRow onPreview={() => setPreviewKind("calendar")} />
      <PermissionsPreviewDialog
        kind={previewKind}
        onClose={() => setPreviewKind(null)}
      />
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
  onPreview,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  connectedEmail: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  busy?: boolean;
  onPreview?: () => void;
}) {
  const { t } = useLanguage();
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
              {t("settings.conn.connected", "Connected")}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] text-text-mute">{description}</p>
        {connected && (
          <p className="mt-1 truncate text-[12px] text-text">{connectedEmail}</p>
        )}
      </div>
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          {onPreview && !connected && (
            <button
              onClick={onPreview}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px] text-text transition hover:bg-bg-hover"
              title="See exactly which permissions Findable will request"
            >
              <Eye className="h-3.5 w-3.5" />
              {t("settings.conn.preview", "Preview permissions")}
            </button>
          )}
          {connected ? (
          <button
            onClick={onDisconnect}
            disabled={busy}
            className="rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px] text-text transition hover:bg-bg-hover disabled:opacity-60"
          >
            {t("common.disconnect", "Disconnect")}
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={busy}
            className="rounded-lg bg-text px-3 py-1.5 text-[12.5px] font-medium text-text-invert transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? t("settings.conn.opening", "Opening Google…") : t("common.connect", "Connect")}
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

function friendlyOAuthError(err: unknown, provider: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("App User OAuth start failed (500)")) {
    return `${provider}: connector gateway error. Try again on the published site (findable.work) or contact support if it persists.`;
  }
  return msg || `Failed to start ${provider} connect`;
}

function GmailRow({ onPreview }: { onPreview: () => void }) {
  const { t } = useLanguage();
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
      title={t("settings.conn.gmail.title", "Gmail")}
      description={t("settings.conn.gmail.desc", "Send outreach emails and read replies from your inbox.")}
      connectedEmail={data?.email ?? null}
      onConnect={() => startMut.mutate()}
      onDisconnect={() => disMut.mutate()}
      busy={startMut.isPending || disMut.isPending}
      onPreview={onPreview}
    />
  );
}

function CalendarRow({ onPreview }: { onPreview: () => void }) {
  const { t } = useLanguage();
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
      title={t("settings.conn.cal.title", "Google Calendar")}
      description={t("settings.conn.cal.desc", "Show your availability and schedule interviews with candidates.")}
      connectedEmail={data?.email ?? null}
      onConnect={() => startMut.mutate()}
      onDisconnect={() => disMut.mutate()}
      busy={startMut.isPending || disMut.isPending}
      onPreview={onPreview}
    />
  );
}

const PERMISSION_DETAILS = {
  gmail: {
    title: "Gmail",
    icon: Mail,
    intro: "Findable is requesting access to your Google Account",
    scopes: [
      {
        label: "Send email on your behalf",
        scope: "gmail.send",
        detail: "So we can deliver outreach messages from your address.",
      },
      {
        label: "Read, compose, and modify (but not permanently delete) email",
        scope: "gmail.modify",
        detail: "So we can thread replies and update conversation status.",
      },
      {
        label: "Read your email messages and settings",
        scope: "gmail.readonly",
        detail: "So we can detect replies from candidates and surface them in the inbox.",
      },
    ],
  },
  calendar: {
    title: "Google Calendar",
    icon: CalendarIcon,
    intro: "Findable is requesting access to your Google Account",
    scopes: [
      {
        label: "See and download any calendar you can access",
        scope: "calendar.readonly",
        detail: "So we can show your real availability when proposing interview slots.",
      },
      {
        label: "View and edit events on all your calendars",
        scope: "calendar.events",
        detail: "So we can create interview events and invite candidates directly.",
      },
    ],
  },
} as const;

function PermissionsPreviewDialog({
  kind,
  onClose,
}: {
  kind: "gmail" | "calendar" | null;
  onClose: () => void;
}) {
  const data = kind ? PERMISSION_DETAILS[kind] : null;
  const Icon = data?.icon;
  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">
          {data ? `${data.title} permissions` : "Permissions"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Exact Google scopes Findable will request when you connect.
        </DialogDescription>
        {data && Icon && (
          <div className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-input">
                <Icon className="h-4.5 w-4.5 text-text" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-text">{data.title}</div>
                <div className="text-[12px] text-text-mute">{data.intro}</div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] font-medium text-text">
                This will allow Findable to:
              </p>
              <ul className="mt-3 space-y-3">
                {data.scopes.map((s) => (
                  <li key={s.scope} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <div className="min-w-0">
                      <div className="text-[12.5px] text-text">{s.label}</div>
                      <div className="mt-0.5 text-[11.5px] text-text-mute">{s.detail}</div>
                      <code className="mt-1 inline-block rounded bg-bg-input px-1.5 py-0.5 font-mono text-[10.5px] text-text-mute">
                        {s.scope}
                      </code>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[11.5px] text-text-faint">
                You can revoke this access any time from your Google Account or by
                disconnecting here.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-bg-elev px-5 py-3">
              <button
                onClick={onClose}
                className="rounded-lg bg-text px-3 py-1.5 text-[12.5px] font-medium text-text-invert transition hover:opacity-90"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Data controls ----------------------------- */

function DataPane() {
  const { t } = useLanguage();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const exportFn = useServerFn(exportCandidatesCsv);
  const exportMut = useMutation({
    mutationFn: () => exportFn({}),
    onSuccess: ({ csv, count }) => {
      if (count === 0) {
        toast.message("No unlocked candidates to export yet.");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `findable-candidates-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${count} candidate${count === 1 ? "" : "s"}`);
    },
    onError: (e) => toast.error((e as Error).message || "Export failed"),
  });
  return (
    <div>
      <Row
        label={t("settings.data.export", "Export data")}
        description={t("settings.data.export.desc", "Download a CSV of the candidates you've unlocked in this account.")}
      >
        <button
          onClick={() => exportMut.mutate()}
          disabled={exportMut.isPending}
          className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px] text-text transition hover:bg-bg-hover disabled:opacity-60"
        >
          {exportMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {exportMut.isPending ? t("settings.data.exporting", "Exporting…") : t("settings.data.export.btn", "Export CSV")}
        </button>
      </Row>
      <Row
        label={t("settings.data.delete", "Delete workspace data")}
        description={t("settings.data.delete.desc", "Permanently remove all workspace data. This cannot be undone.")}
      >
        <button
          onClick={() => setConfirmOpen(true)}
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12.5px] font-medium text-destructive transition hover:bg-destructive/15"
        >
          {t("settings.data.delete.btn", "Delete data")}
        </button>
      </Row>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.data.delete.dlg.title", "Delete workspace data?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.data.delete.dlg.desc", "Deletion requests are handled by our team. Please contact support at support@findable.work to proceed.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.location.href = "mailto:support@findable.work?subject=Delete%20workspace%20data";
              }}
            >
              {t("common.contact_support", "Contact support")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------- Security -------------------------------- */

function SecurityPane({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [pwSending, setPwSending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOutAll = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: "global" });
      toast.success("Signed out everywhere");
      onClose();
      window.location.href = "/login";
    } catch (e) {
      toast.error((e as Error).message || "Sign out failed");
      setSigningOut(false);
    }
  };
  const changePassword = async () => {
    setPwSending(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user?.email) {
        toast.error("No email on account");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(data.user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) toast.error(error.message);
      else toast.success("Password reset email sent — check your inbox.");
    } finally {
      setPwSending(false);
    }
  };
  return (
    <div>
      <Row
        label={t("settings.sec.password", "Change password")}
        description={t("settings.sec.password.desc", "Send a password reset email to your account.")}
      >
        <button
          onClick={changePassword}
          disabled={pwSending}
          className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px] text-text transition hover:bg-bg-hover disabled:opacity-60"
        >
          {pwSending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pwSending ? t("settings.sec.password.sending", "Sending…") : t("settings.sec.password.btn", "Send email")}
        </button>
      </Row>
      <Row
        label={t("settings.sec.sessions", "Active sessions")}
        description={t("settings.sec.sessions.desc", "This device is currently signed in. Use “Log out all devices” to end any other active sessions.")}
      >
        <span className="text-[12px] text-text-mute">{t("settings.sec.this_device", "This device")}</span>
      </Row>
      <Row
        label={t("settings.sec.logout_all", "Log out all devices")}
        description={t("settings.sec.logout_all.desc", "End every signed-in session, including this one.")}
      >
        <button
          onClick={() => setSignOutOpen(true)}
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12.5px] font-medium text-destructive transition hover:bg-destructive/15"
        >
          {t("settings.sec.logout_all.btn", "Log out all")}
        </button>
      </Row>
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.sec.logout_all.dlg.title", "Sign out of every device?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.sec.logout_all.dlg.desc", "You'll be signed out here and on every other device where you're currently logged in. You can sign back in any time.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={signOutAll} disabled={signingOut}>
              {signingOut ? t("settings.sec.logout_all.dlg.confirming", "Signing out…") : t("settings.sec.logout_all.dlg.confirm", "Sign out everywhere")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------- Account -------------------------------- */

function AccountPane() {
  const { t } = useLanguage();
  const [email, setEmail] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wiping, setWiping] = useState(false);
  const [nameDraft, setNameDraft] = useState<string>("");
  const [nameHydrated, setNameHydrated] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const qc = useQueryClient();
  const getProfileFn = useServerFn(getProfile);
  const updateNameFn = useServerFn(updateDisplayName);
  const deleteAccountFn = useServerFn(deleteOwnAccount);
  const wipeDataFn = useServerFn(wipeOwnTestData);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfileFn(),
  });

  const updateNameMut = useMutation({
    mutationFn: (name: string) => updateNameFn({ data: { displayName: name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Display name updated");
    },
    onError: (err) => {
      toast.error("Failed to update name: " + (err as Error).message);
    },
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    if (!nameHydrated && profile) {
      setNameDraft(profile.displayName ?? "");
      setNameHydrated(true);
    }
  }, [profile, nameHydrated]);

  // Debounce save: only after 600ms of no edits.
  useEffect(() => {
    if (!nameHydrated) return;
    const current = profile?.displayName ?? "";
    if (nameDraft === current) return;
    const timer = setTimeout(() => {
      updateNameMut.mutate(nameDraft);
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameDraft, nameHydrated]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccountFn({});
      await supabase.auth.signOut().catch(() => {});
      window.location.href = "/";
    } catch (e) {
      toast.error("Couldn't delete account: " + (e as Error).message);
      setDeleting(false);
    }
  };

  const handleWipe = async () => {
    setWiping(true);
    try {
      const res = await wipeDataFn({ data: { confirm: "WIPE" } });
      toast.success(`Wiped ${res.totalDeleted} rows across your workspace.`);
      setWipeOpen(false);
      setWipeConfirm("");
      qc.invalidateQueries();
    } catch (e) {
      toast.error("Wipe failed: " + (e as Error).message);
    } finally {
      setWiping(false);
    }
  };

  const initial = (nameDraft || email || "?")[0]?.toUpperCase() ?? "?";
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-text text-[16px] font-semibold text-text-invert">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-text">
            {nameDraft || email || t("settings.acct.account", "Account")}
          </div>
          <div className="truncate text-[12px] text-text-mute">{email}</div>
        </div>
      </div>
      <Row label={t("settings.acct.display_name", "Display name")} description={t("settings.acct.display_name.desc", "Shown to your teammates.")}>
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            const current = profile?.displayName ?? "";
            if (nameDraft !== current) updateNameMut.mutate(nameDraft);
          }}
          disabled={profileLoading || updateNameMut.isPending}
          className="h-8 w-[220px]"
          placeholder={t("settings.acct.display_name.ph", "Your name")}
        />
      </Row>
      <Row label={t("settings.acct.email", "Email")} description={t("settings.acct.email.desc", "Used for sign-in and notifications.")}>
        <span className="text-[12.5px] text-text-mute">{email || "—"}</span>
      </Row>
      <Row label={t("settings.acct.role", "Role")} description={t("settings.acct.role.desc", "Your access level in this workspace.")}>
        <span className="text-[12.5px] text-text-mute">{t("settings.acct.role.owner", "Owner")}</span>
      </Row>
      <Row label={t("settings.acct.seats", "Seats")} description={t("settings.acct.seats.desc", "Members in this workspace.")}>
        <span className="text-[12.5px] text-text-mute">1 of 1</span>
      </Row>
      <Row
        label={t("settings.acct.delete", "Delete account")}
        description={t("settings.acct.delete.desc", "Permanently delete your account and all data.")}
      >
        <button
          onClick={() => setConfirmOpen(true)}
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12.5px] font-medium text-destructive transition hover:bg-destructive/15"
        >
          {t("settings.acct.delete", "Delete account")}
        </button>
      </Row>
      <Row
        label="Wipe workspace data"
        description="Delete all candidates, jobs, conversations, outreach, and audit logs. Keeps your account, billing and connections."
      >
        <button
          onClick={() => setWipeOpen(true)}
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12.5px] font-medium text-destructive transition hover:bg-destructive/15"
        >
          Wipe data
        </button>
      </Row>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.acct.delete.dlg.title", "Delete your account?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.acct.delete.dlg.desc", "This permanently deletes your account, all your candidates, conversations, jobs, and outreach. This cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t("settings.acct.delete.dlg.confirming", "Deleting…") : t("settings.acct.delete.dlg.confirm", "Delete forever")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={wipeOpen} onOpenChange={(o) => { setWipeOpen(o); if (!o) setWipeConfirm(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wipe all workspace data?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently deletes every candidate, job, conversation, message, outreach thread, interview, and audit log. Your account, billing, and connected services stay intact. Type <strong>WIPE</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={wipeConfirm}
            onChange={(e) => setWipeConfirm(e.target.value)}
            placeholder="Type WIPE"
            className="h-9"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={wiping}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWipe}
              disabled={wiping || wipeConfirm !== "WIPE"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {wiping ? "Wiping…" : "Wipe everything"}
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
  const { t } = useLanguage();
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
          placeholder={t("settings.help.search.ph", "Search help articles")}
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
            {t("settings.help.empty", "No articles found.")}
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
          {t("settings.help.support", "Need a hand? Our team usually replies within a few hours.")}
        </div>
        <a
          href="mailto:support@findable.work"
          className="rounded-lg bg-text px-3 py-1.5 text-[12.5px] font-medium text-text-invert transition hover:opacity-90"
        >
          {t("common.contact_support", "Contact support")}
        </a>
      </div>
    </div>
  );
}
/* ------------------------------ Usage & billing --------------------------- */

function BillingPane() {
  const summaryFn = useServerFn(getCreditsSummary);
  const checkoutFn = useServerFn(createCheckoutSession);
  const portalFn = useServerFn(openBillingPortal);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["credits-summary"],
    queryFn: () => summaryFn({}),
  });

  // Break out of the Lovable preview iframe — Stripe Checkout sends
  // X-Frame-Options: DENY so we'd otherwise navigate to a blank pane.
  const redirectToStripe = (url: string) => {
    if (typeof window === "undefined" || !url) return;
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = url;
        return;
      }
    } catch {
      /* cross-origin parent — fall through */
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const returnUrl =
    typeof window === "undefined"
      ? "https://findable.work/app"
      : `${window.location.origin}/app`;

  const checkoutMut = useMutation({
    mutationFn: (vars: { tierKey: string; kind: "topup" | "subscription" }) =>
      checkoutFn({
        data: {
          tierKey: vars.tierKey as never,
          kind: vars.kind,
          returnUrl,
        } as never,
      }),
    onSuccess: ({ url }) => redirectToStripe(url),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    },
  });

  const portalMut = useMutation({
    mutationFn: () => portalFn({ data: { returnUrl } }),
    onSuccess: ({ url }) => redirectToStripe(url),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not open billing portal");
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-text-mute">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading usage…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-border bg-bg-elev p-4 text-[12.5px] text-text-mute">
        Couldn't load your credit balance.{" "}
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["credits-summary"] })}
          className="underline hover:text-text"
        >
          Try again
        </button>
        .
      </div>
    );
  }

  const {
    balance,
    sourcingRunCost,
    candidateAddCost,
    phoneRevealCost,
    bundles,
    stats30d,
    ledger,
    subscription,
  } = data;
  // One initial sourcing run targets ~20 candidates → 20 credits.
  const low = balance < 20;
  const subActive =
    !!subscription && (subscription.status === "active" || subscription.status === "trialing");
  const currentTierKey = subActive ? subscription!.tierKey : null;
  const renewLabel = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Balance hero */}
      <div className="rounded-xl border border-border bg-bg-elev p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Credit balance
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <div className="text-[28px] font-semibold leading-none text-text tabular-nums">
                {balance.toLocaleString()}
              </div>
              <div className="text-[12px] text-text-mute">credits</div>
            </div>
          </div>
          <div className="text-right text-[11.5px] text-text-mute">
            <div>{candidateAddCost ?? 1} credit / candidate sourced</div>
            <div>{phoneRevealCost} credits / phone reveal</div>
          </div>
        </div>
        {low && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
            You're running low. Top up to keep sourcing without interruption.
          </div>
        )}
      </div>

      {/* Current plan */}
      <div className="rounded-xl border border-border bg-bg-elev p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Current plan
            </div>
            {subActive ? (
              <>
                <div className="mt-1 text-[15px] font-semibold text-text">
                  {bundles.find((b) => b.key === currentTierKey)?.name ?? subscription!.tierKey}
                  <span className="ml-2 text-[11.5px] font-normal text-text-mute">
                    {subscription!.monthlyCredits.toLocaleString()} credits / month
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-text-mute">
                  {subscription!.cancelAtPeriodEnd
                    ? `Cancels on ${renewLabel}`
                    : renewLabel
                      ? `Renews on ${renewLabel}`
                      : "Active"}
                </div>
              </>
            ) : (
              <div className="mt-1 text-[13px] text-text-mute">
                No active plan. Subscribe below or top up one-time credits.
              </div>
            )}
          </div>
          {subActive && (
            <button
              onClick={() => portalMut.mutate()}
              disabled={portalMut.isPending}
              className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px] font-medium text-text transition hover:bg-bg-hover disabled:opacity-60"
            >
              {portalMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Manage subscription
            </button>
          )}
        </div>
      </div>

      {/* 30d stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          label="Spent · last 30 days"
          value={stats30d.spent.toLocaleString()}
          sub={`${stats30d.candidatesAdded ?? 0} candidates · ${stats30d.phoneReveals} reveals`}
        />
        <StatCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Added · last 30 days"
          value={stats30d.added.toLocaleString()}
          sub="From top-ups & bonuses"
        />
      </div>

      {/* Monthly plans */}
      <div>
        <SectionTitle>Monthly plans</SectionTitle>
        <p className="mt-1 text-[11.5px] text-text-faint">
          Credits refill on every renewal. Switch or cancel anytime.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {bundles.map((b) => {
            const isCurrent = currentTierKey === b.key;
            const isPending =
              checkoutMut.isPending &&
              checkoutMut.variables?.tierKey === b.key &&
              checkoutMut.variables?.kind === "subscription";
            return (
              <div
                key={`sub-${b.key}`}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-bg-elev p-4",
                  isCurrent ? "border-text" : b.highlight ? "border-text/60" : "border-border",
                )}
              >
                {isCurrent ? (
                  <span className="absolute -top-2 left-3 rounded-full bg-text px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-invert">
                    Current plan
                  </span>
                ) : b.highlight ? (
                  <span className="absolute -top-2 left-3 rounded-full bg-text px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-invert">
                    Most popular
                  </span>
                ) : null}
                <div className="text-[13px] font-semibold text-text">{b.name}</div>
                <div className="mt-1 text-[12px] text-text-mute">{b.tagline}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-[22px] font-semibold text-text tabular-nums">
                    ${(b.amountCents / 100).toFixed(0)}
                  </span>
                  <span className="text-[11.5px] text-text-mute">/ month</span>
                </div>
                <div className="text-[11.5px] text-text-mute">
                  {b.credits.toLocaleString()} credits / month
                </div>
                <button
                  onClick={() =>
                    isCurrent
                      ? portalMut.mutate()
                      : checkoutMut.mutate({ tierKey: b.key, kind: "subscription" })
                  }
                  disabled={checkoutMut.isPending || portalMut.isPending}
                  className={cn(
                    "mt-4 flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition disabled:opacity-60",
                    isCurrent || b.highlight
                      ? "bg-text text-text-invert hover:opacity-90"
                      : "border border-border bg-bg text-text hover:bg-bg-hover",
                  )}
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isCurrent
                    ? "Manage"
                    : subActive
                      ? "Switch to this plan"
                      : isPending
                        ? "Redirecting…"
                        : "Subscribe"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-text-faint">
          Secure checkout via Stripe. Unused credits reset at each renewal.
        </p>
      </div>

      {/* One-time top-ups */}
      <div>
        <SectionTitle>One-time top-up</SectionTitle>
        <p className="mt-1 text-[11.5px] text-text-faint">
          Need more this month? One-time purchases stack on top of your balance.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {bundles.map((b) => {
            const isPending =
              checkoutMut.isPending &&
              checkoutMut.variables?.tierKey === b.key &&
              checkoutMut.variables?.kind === "topup";
            return (
              <div
                key={`topup-${b.key}`}
                className="relative flex flex-col rounded-xl border border-border bg-bg-elev p-4"
              >
                <div className="text-[13px] font-semibold text-text">{b.name}</div>
                <div className="mt-1 text-[12px] text-text-mute">{b.tagline}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-[22px] font-semibold text-text tabular-nums">
                    ${(b.amountCents / 100).toFixed(0)}
                  </span>
                  <span className="text-[11.5px] text-text-mute">USD</span>
                </div>
                <div className="text-[11.5px] text-text-mute">
                  {b.credits.toLocaleString()} credits
                </div>
                <button
                  onClick={() => checkoutMut.mutate({ tierKey: b.key, kind: "topup" })}
                  disabled={checkoutMut.isPending || portalMut.isPending}
                  className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px] font-medium text-text transition hover:bg-bg-hover disabled:opacity-60"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isPending ? "Redirecting…" : "Buy once"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ledger */}
      <div>
        <SectionTitle>Recent activity</SectionTitle>
        {ledger.length === 0 ? (
          <p className="mt-2 rounded-lg border border-border bg-bg-elev p-4 text-[12.5px] text-text-mute">
            No activity yet.
          </p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-lg border border-border bg-bg-elev">
            <table className="w-full text-[12.5px]">
              <thead className="bg-bg-side text-[11px] uppercase tracking-wide text-text-faint">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2 text-right font-medium">Δ</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 text-text-mute">
                      {new Date(row.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-text">{row.reason}</td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        row.delta < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {row.delta > 0 ? `+${row.delta}` : row.delta}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-mute">
                      {row.balance_after ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-elev p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-text-faint">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[20px] font-semibold leading-none text-text tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-text-mute">{sub}</div>
    </div>
  );
}
