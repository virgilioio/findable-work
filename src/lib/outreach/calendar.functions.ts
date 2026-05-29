import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authorizeAppUserOAuth,
  callAsAppUser,
} from "@/integrations/lovable/appUserConnector";

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export const getCalendarConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_calendar_connections")
      .select("email, created_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const startCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ returnUrl: z.string().url() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const clientId = process.env.GOOGLE_APP_USER_CONNECTOR_CLIENT_ID;
    if (!clientId) throw new Error("Google connector client ID not configured");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      connectorId: "google",
      appUserId: context.userId,
      connectorClientId: clientId,
      returnUrl: data.returnUrl,
      credentialsConfiguration: { scopes: CALENDAR_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ connectionId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const res = await callAsAppUser({
      connectionId: data.connectionId,
      connectorId: "google_calendar",
      path: "/calendar/v3/users/me/calendarList?maxResults=1",
    });
    if (!res.ok) {
      throw new Error(
        `Calendar profile fetch failed (${res.status}): ${await res.text()}`,
      );
    }
    const list = (await res.json()) as {
      items?: Array<{ id?: string; primary?: boolean }>;
    };
    const primary = list.items?.find((i) => i.primary) ?? list.items?.[0];
    const email = primary?.id ?? "unknown";
    const { error } = await supabaseAdmin
      .from("user_calendar_connections")
      .upsert(
        {
          user_id: context.userId,
          connection_id: data.connectionId,
          email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { email };
  });

export const disconnectCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_calendar_connections")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });