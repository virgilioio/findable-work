/**
 * Google Calendar wiring for interview schedules. Server-only.
 *
 * Reuses the existing user_calendar_connections OAuth (see
 * src/lib/outreach/google-oauth.server.ts) to create real Calendar events
 * with Google Meet links + interviewer/candidate attendees.
 */
import { googleFetch } from "@/lib/outreach/google-oauth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type InterviewerRef = { name: string; role?: string; email?: string };
export type StageRef = {
  id: string;
  name: string;
  format?: string;
  duration_min?: number;
  description?: string;
  interviewers?: InterviewerRef[];
  focus_areas?: string[];
  suggested_questions?: string[];
};
export type ScheduleRow = {
  id: string;
  loop_id: string;
  user_id: string;
  conversation_id: string;
  candidate_id: string | null;
  candidate_name: string;
  candidate_email: string | null;
  stage_id: string;
  stage_name: string;
  start_at: string | null;
  end_at: string | null;
  is_async: boolean;
  google_event_id: string | null;
  meet_link: string | null;
  status: string;
  notes: string;
};

export class CalendarNotConnectedError extends Error {
  code = "calendar_not_connected";
  constructor() {
    super("Google Calendar is not connected");
  }
}

export async function hasCalendarConnection(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_calendar_connections")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

function buildDescription(stage: StageRef, prepTips: string | null): string {
  const parts: string[] = [];
  if (stage.description) parts.push(stage.description);
  if (stage.focus_areas?.length) {
    parts.push("Focus areas:\n" + stage.focus_areas.map((f) => `• ${f}`).join("\n"));
  }
  if (stage.suggested_questions?.length) {
    parts.push(
      "Suggested questions:\n" +
        stage.suggested_questions.map((q) => `• ${q}`).join("\n"),
    );
  }
  if (prepTips) parts.push(`Prep tips:\n${prepTips}`);
  parts.push("— Scheduled via Findable");
  return parts.join("\n\n");
}

export async function createCalendarEventForSchedule(opts: {
  userId: string;
  schedule: ScheduleRow;
  stage: StageRef;
  prepTips: string | null;
  jobTitle?: string;
}): Promise<{ google_event_id: string; meet_link: string | null }> {
  const { userId, schedule, stage, prepTips, jobTitle } = opts;
  if (schedule.is_async || !schedule.start_at) {
    throw new Error("Schedule is async or missing a start time");
  }
  const connected = await hasCalendarConnection(userId);
  if (!connected) throw new CalendarNotConnectedError();

  const duration = Math.max(15, stage.duration_min ?? 30);
  const start = new Date(schedule.start_at);
  const end = schedule.end_at
    ? new Date(schedule.end_at)
    : new Date(start.getTime() + duration * 60_000);

  const attendees: { email: string; displayName?: string; optional?: boolean }[] = [];
  for (const i of stage.interviewers ?? []) {
    if (i.email) attendees.push({ email: i.email, displayName: i.name });
  }
  if (schedule.candidate_email) {
    attendees.push({
      email: schedule.candidate_email,
      displayName: schedule.candidate_name,
    });
  }

  const titlePieces = [
    jobTitle ? `${jobTitle} — ${stage.name}` : stage.name,
    schedule.candidate_name ? `with ${schedule.candidate_name}` : "",
  ].filter(Boolean);

  const body = {
    summary: titlePieces.join(" "),
    description: buildDescription(stage, prepTips),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees,
    conferenceData: {
      createRequest: {
        requestId: `findable-${schedule.id}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    reminders: { useDefault: true },
  };

  const res = await googleFetch(
    userId,
    "calendar",
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Calendar event create failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const meet =
    data?.hangoutLink ||
    data?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")
      ?.uri ||
    null;
  return { google_event_id: String(data.id), meet_link: meet };
}

export async function deleteCalendarEvent(opts: {
  userId: string;
  googleEventId: string;
}): Promise<void> {
  const res = await googleFetch(
    opts.userId,
    "calendar",
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(opts.googleEventId)}?sendUpdates=all`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Calendar event delete failed (${res.status}): ${txt.slice(0, 300)}`);
  }
}