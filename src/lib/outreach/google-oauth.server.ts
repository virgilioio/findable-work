/**
 * Direct Google OAuth helpers (server-only).
 *
 * Replaces the Lovable App User Connector broker for Gmail/Calendar with
 * our own Google Cloud OAuth client (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET).
 *
 * Tokens are stored per-user in `user_gmail_connections` /
 * `user_calendar_connections`. Access tokens are refreshed on demand using
 * the long-lived refresh token.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ConnectionKind = "gmail" | "calendar";

const TABLE: Record<ConnectionKind, string> = {
  gmail: "user_gmail_connections",
  calendar: "user_calendar_connections",
};

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return b64url(arr);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(hash));
}

export function generateState(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return b64url(arr);
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
  loginHint?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    include_granted_scopes: "true",
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(opts: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      code: opts.code,
      code_verifier: opts.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: opts.redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function fetchUserInfo(accessToken: string): Promise<{
  email: string;
  name?: string;
}> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Userinfo failed (${res.status})`);
  return (await res.json()) as { email: string; name?: string };
}

async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  scope?: string;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number; scope?: string };
}

/**
 * Get a valid (non-expired) access token for the user, refreshing if needed.
 * Throws if the user has no connection.
 */
export async function getAccessTokenForUser(
  userId: string,
  kind: ConnectionKind,
): Promise<{ accessToken: string; email: string }> {
  const table = TABLE[kind];
  const { data, error } = await (supabaseAdmin as any)
    .from(table)
    .select("access_token, refresh_token, token_expires_at, email")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${kind === "gmail" ? "Gmail" : "Google Calendar"} not connected`);
  if (!data.refresh_token) {
    throw new Error(`${kind === "gmail" ? "Gmail" : "Google Calendar"} connection is missing a refresh token. Please reconnect.`);
  }

  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;
  // 60s safety buffer
  if (data.access_token && expiresAt > Date.now() + 60_000) {
    return { accessToken: data.access_token, email: data.email };
  }

  const refreshed = await refreshAccessToken(data.refresh_token);
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await (supabaseAdmin as any)
    .from(table)
    .update({
      access_token: refreshed.access_token,
      token_expires_at: newExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { accessToken: refreshed.access_token, email: data.email };
}

/**
 * Call a Google API endpoint as the connected user. Handles token refresh.
 * Pass an absolute URL (e.g. https://gmail.googleapis.com/gmail/v1/users/me/profile).
 */
export async function googleFetch(
  userId: string,
  kind: ConnectionKind,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const { accessToken } = await getAccessTokenForUser(userId, kind);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers });
}