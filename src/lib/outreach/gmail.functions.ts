import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authorizeAppUserOAuth,
  callAsAppUser,
} from "@/integrations/lovable/appUserConnector";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.readonly",
];

function b64url(str: string) {
  // btoa handles latin-1 only; encode UTF-8 first.
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const norm = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(norm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export const getGmailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_gmail_connections")
      .select("email, created_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const startGmailConnect = createServerFn({ method: "POST" })
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
      credentialsConfiguration: { scopes: GMAIL_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ connectionId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const res = await callAsAppUser({
      connectionId: data.connectionId,
      connectorId: "google_mail",
      path: "/gmail/v1/users/me/profile",
    });
    if (!res.ok) {
      throw new Error(`Gmail profile fetch failed (${res.status}): ${await res.text()}`);
    }
    const profile = (await res.json()) as { emailAddress?: string };
    const email = profile.emailAddress ?? "unknown";
    const { error } = await supabaseAdmin
      .from("user_gmail_connections")
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

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_gmail_connections")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function loadConnection(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_gmail_connections")
    .select("connection_id, email")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Gmail not connected");
  return data;
}

function buildRawEmail(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}) {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
  lines.push("", opts.body);
  return b64url(lines.join("\r\n"));
}

export const sendOutreachEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      conversationId: z.string().uuid(),
      candidateId: z.string().uuid(),
      subject: z.string().min(1).max(500),
      body: z.string().min(1).max(20000),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const conn = await loadConnection(userId);

    const { data: cand, error: candErr } = await supabaseAdmin
      .from("candidates")
      .select("id, name, email")
      .eq("id", data.candidateId)
      .eq("user_id", userId)
      .single();
    if (candErr || !cand) throw new Error("Candidate not found");
    if (!cand.email) throw new Error(`No email on file for ${cand.name}`);

    const raw = buildRawEmail({
      from: conn.email,
      to: cand.email,
      subject: data.subject,
      body: data.body,
    });

    const res = await callAsAppUser({
      connectionId: conn.connection_id,
      connectorId: "google_mail",
      path: "/gmail/v1/users/me/messages/send",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      },
    });
    if (!res.ok) {
      throw new Error(`Gmail send failed (${res.status}): ${await res.text()}`);
    }
    const sent = (await res.json()) as { id: string; threadId: string };

    const now = new Date().toISOString();
    const snippet = data.body.slice(0, 140);

    const { data: thread, error: threadErr } = await supabaseAdmin
      .from("outreach_threads")
      .upsert(
        {
          user_id: userId,
          conversation_id: data.conversationId,
          candidate_id: data.candidateId,
          gmail_thread_id: sent.threadId,
          subject: data.subject,
          last_snippet: snippet,
          last_message_at: now,
          status: "sent",
          unread: false,
          updated_at: now,
        },
        { onConflict: "user_id,gmail_thread_id" },
      )
      .select("id")
      .single();
    if (threadErr) throw new Error(threadErr.message);

    const { error: msgErr } = await supabaseAdmin
      .from("outreach_messages")
      .insert({
        thread_id: thread.id,
        user_id: userId,
        gmail_message_id: sent.id,
        direction: "out",
        from_addr: conn.email,
        to_addr: cand.email,
        subject: data.subject,
        body_text: data.body,
        sent_at: now,
      });
    if (msgErr) throw new Error(msgErr.message);

    // Mark candidate Contacted
    await supabaseAdmin
      .from("candidates")
      .update({
        stage: "Contacted",
        stage_changed_at: now,
        contacted_at: now,
        contact_channel: "Email",
      })
      .eq("id", data.candidateId)
      .eq("user_id", userId);

    return { threadId: thread.id, gmailMessageId: sent.id };
  });

export const listOutreachThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: threads, error } = await supabase
      .from("outreach_threads")
      .select("id, candidate_id, subject, last_snippet, last_message_at, status, unread")
      .eq("user_id", userId)
      .eq("conversation_id", data.conversationId)
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);

    if (!threads || threads.length === 0) return { threads: [], unreadCount: 0 };

    const candidateIds = Array.from(new Set(threads.map((t) => t.candidate_id)));
    const { data: cands } = await supabase
      .from("candidates")
      .select("id, name, role, avatar")
      .in("id", candidateIds);
    const candMap = new Map((cands ?? []).map((c) => [c.id, c]));

    const enriched = threads.map((t) => ({
      ...t,
      candidate: candMap.get(t.candidate_id) ?? null,
    }));
    const unreadCount = threads.filter((t) => t.unread).length;
    return { threads: enriched, unreadCount };
  });

export const getOutreachThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ threadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: thread, error: tErr } = await supabase
      .from("outreach_threads")
      .select("*")
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .single();
    if (tErr || !thread) throw new Error("Thread not found");

    const { data: messages, error: mErr } = await supabase
      .from("outreach_messages")
      .select("*")
      .eq("thread_id", data.threadId)
      .order("sent_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    const { data: cand } = await supabase
      .from("candidates")
      .select("id, name, role, company, avatar, email")
      .eq("id", thread.candidate_id)
      .maybeSingle();

    // Mark as read
    if (thread.unread) {
      await supabase
        .from("outreach_threads")
        .update({ unread: false })
        .eq("id", data.threadId);
    }

    return { thread, messages: messages ?? [], candidate: cand };
  });

export const replyInThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      threadId: z.string().uuid(),
      body: z.string().min(1).max(20000),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const conn = await loadConnection(userId);

    const { data: thread, error: tErr } = await supabaseAdmin
      .from("outreach_threads")
      .select("id, gmail_thread_id, subject, candidate_id")
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .single();
    if (tErr || !thread) throw new Error("Thread not found");

    const { data: cand } = await supabaseAdmin
      .from("candidates")
      .select("email")
      .eq("id", thread.candidate_id)
      .single();
    if (!cand?.email) throw new Error("No candidate email");

    // Get last inbound message id for proper threading headers
    const { data: lastInbound } = await supabaseAdmin
      .from("outreach_messages")
      .select("gmail_message_id")
      .eq("thread_id", data.threadId)
      .eq("direction", "in")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const subject = thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`;

    const raw = buildRawEmail({
      from: conn.email,
      to: cand.email,
      subject,
      body: data.body,
      inReplyTo: lastInbound?.gmail_message_id,
      references: lastInbound?.gmail_message_id,
    });

    const res = await callAsAppUser({
      connectionId: conn.connection_id,
      connectorId: "google_mail",
      path: "/gmail/v1/users/me/messages/send",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw, threadId: thread.gmail_thread_id }),
      },
    });
    if (!res.ok) {
      throw new Error(`Gmail send failed (${res.status}): ${await res.text()}`);
    }
    const sent = (await res.json()) as { id: string };
    const now = new Date().toISOString();
    const snippet = data.body.slice(0, 140);

    await supabaseAdmin.from("outreach_messages").insert({
      thread_id: thread.id,
      user_id: userId,
      gmail_message_id: sent.id,
      direction: "out",
      from_addr: conn.email,
      to_addr: cand.email,
      subject,
      body_text: data.body,
      sent_at: now,
    });
    await supabaseAdmin
      .from("outreach_threads")
      .update({ last_snippet: snippet, last_message_at: now, updated_at: now })
      .eq("id", thread.id);

    return { ok: true };
  });

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    try { return b64urlDecode(payload.body.data); } catch { return ""; }
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        try { return b64urlDecode(part.body.data); } catch { /* noop */ }
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return "";
}

function headerValue(headers: any[], name: string): string {
  const h = (headers || []).find((x: any) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

export const syncOutreachReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { data: conn } = await supabaseAdmin
      .from("user_gmail_connections")
      .select("connection_id, email")
      .eq("user_id", userId)
      .maybeSingle();
    if (!conn) return { synced: 0 };

    const { data: threads } = await supabaseAdmin
      .from("outreach_threads")
      .select("id, gmail_thread_id")
      .eq("user_id", userId)
      .eq("conversation_id", data.conversationId);
    if (!threads || threads.length === 0) return { synced: 0 };

    let synced = 0;
    for (const t of threads) {
      if (!t.gmail_thread_id) continue;
      const res = await callAsAppUser({
        connectionId: conn.connection_id,
        connectorId: "google_mail",
        path: `/gmail/v1/users/me/threads/${t.gmail_thread_id}?format=full`,
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as { messages?: any[] };
      const msgs = payload.messages ?? [];

      const { data: existing } = await supabaseAdmin
        .from("outreach_messages")
        .select("gmail_message_id")
        .eq("thread_id", t.id);
      const known = new Set((existing ?? []).map((m) => m.gmail_message_id));

      let latestInboundAt: string | null = null;
      let latestSnippet = "";

      for (const m of msgs) {
        if (known.has(m.id)) continue;
        const headers = m.payload?.headers ?? [];
        const from = headerValue(headers, "From");
        const to = headerValue(headers, "To");
        const subject = headerValue(headers, "Subject");
        const isInbound = !from.toLowerCase().includes(conn.email.toLowerCase());
        const sentAt = m.internalDate
          ? new Date(Number(m.internalDate)).toISOString()
          : new Date().toISOString();
        const body = extractBody(m.payload) || (m.snippet ?? "");

        await supabaseAdmin.from("outreach_messages").insert({
          thread_id: t.id,
          user_id: userId,
          gmail_message_id: m.id,
          direction: isInbound ? "in" : "out",
          from_addr: from,
          to_addr: to,
          subject,
          body_text: body,
          sent_at: sentAt,
        });

        if (isInbound) {
          latestInboundAt = sentAt;
          latestSnippet = (body || m.snippet || "").slice(0, 140);
          synced++;
        }
      }

      if (latestInboundAt) {
        await supabaseAdmin
          .from("outreach_threads")
          .update({
            status: "replied",
            unread: true,
            last_snippet: latestSnippet,
            last_message_at: latestInboundAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", t.id);
      }
    }
    return { synced };
  });