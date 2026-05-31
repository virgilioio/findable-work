import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CALENDAR_SCOPES,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchUserInfo,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "./google-oauth.server";

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
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured");

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    const { error } = await (supabaseAdmin as any)
      .from("oauth_pkce_state")
      .insert({
        state,
        user_id: context.userId,
        code_verifier: codeVerifier,
        kind: "calendar",
        return_to: data.returnUrl,
      });
    if (error) throw new Error(error.message);

    const authorizationUrl = buildAuthorizeUrl({
      clientId,
      redirectUri: data.returnUrl,
      scopes: CALENDAR_SCOPES,
      state,
      codeChallenge,
    });
    return { authorizationUrl };
  });

export const completeCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      code: z.string().min(1),
      state: z.string().min(1),
      redirectUri: z.string().url(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: pkce, error: pkceErr } = await (supabaseAdmin as any)
      .from("oauth_pkce_state")
      .select("user_id, code_verifier, created_at")
      .eq("state", data.state)
      .maybeSingle();
    if (pkceErr) throw new Error(pkceErr.message);
    if (!pkce) throw new Error("Invalid or expired OAuth state");
    if (pkce.user_id !== context.userId) throw new Error("OAuth state user mismatch");
    if (Date.now() - new Date(pkce.created_at).getTime() > 10 * 60 * 1000) {
      throw new Error("OAuth state expired");
    }

    await (supabaseAdmin as any).from("oauth_pkce_state").delete().eq("state", data.state);

    const tokens = await exchangeCodeForTokens({
      code: data.code,
      codeVerifier: pkce.code_verifier,
      redirectUri: data.redirectUri,
    });
    const info = await fetchUserInfo(tokens.access_token);

    const row = {
      user_id: context.userId,
      email: info.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabaseAdmin as any)
      .from("user_calendar_connections")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    return { email: info.email };
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
