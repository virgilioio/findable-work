import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Apollo phone-reveal webhook. Apollo POSTs here asynchronously (minutes
// after the reveal request) with the person's phone numbers, if any.
// Secured via `?token=` query param matched against APOLLO_WEBHOOK_SECRET,
// since Apollo does not sign webhook callbacks.

const PhoneNumber = z
  .object({
    sanitized_number: z.string().nullish(),
    raw_number: z.string().nullish(),
    type: z.string().nullish(),
    type_cd: z.string().nullish(),
    status: z.string().nullish(),
    status_cd: z.string().nullish(),
  })
  .passthrough();

const Payload = z
  .object({
    id: z.string().nullish(),
    person: z
      .object({
        id: z.string().nullish(),
        phone_numbers: z.array(PhoneNumber).nullish(),
      })
      .passthrough()
      .nullish(),
    people: z
      .array(
        z
          .object({
            id: z.string().nullish(),
            phone_numbers: z.array(PhoneNumber).nullish(),
          })
          .passthrough(),
      )
      .nullish(),
    phone_numbers: z.array(PhoneNumber).nullish(),
  })
  .passthrough();

function pickPhone(nums: Array<z.infer<typeof PhoneNumber>> | null | undefined): string | null {
  if (!nums || nums.length === 0) return null;
  const isMobile = (n: z.infer<typeof PhoneNumber>) =>
    (n.type ?? "").toLowerCase().includes("mobile") ||
    (n.type_cd ?? "").toLowerCase().includes("mobile");
  const mobile = nums.find(isMobile);
  const chosen = mobile ?? nums[0];
  return chosen.sanitized_number || chosen.raw_number || null;
}

export const Route = createFileRoute("/api/public/apollo/phone")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const expected = process.env.APOLLO_WEBHOOK_SECRET;
        if (!expected || !token || token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const parsed = Payload.safeParse(raw);
        if (!parsed.success) {
          console.error("Apollo phone webhook: invalid payload", parsed.error.flatten());
          // Return 200 so Apollo doesn't retry forever for shape mismatches.
          return new Response("ok", { status: 200 });
        }

        const body = parsed.data;

        // Apollo sends successful bulk_match webhooks as `people: [{id, phone_numbers}]`.
        // Older / single-person shapes may use `person` or top-level id/phone_numbers.
        type PersonShape = {
          id?: string | null;
          phone_numbers?: Array<z.infer<typeof PhoneNumber>> | null;
        };
        const people: PersonShape[] =
          (body.people && body.people.length ? body.people : null) ??
          (body.person ? [body.person] : null) ??
          (body.id || body.phone_numbers
            ? [{ id: body.id ?? null, phone_numbers: body.phone_numbers ?? null }]
            : []);

        if (people.length === 0) {
          console.error("Apollo phone webhook: no person data in payload", raw);
          return new Response("ok", { status: 200 });
        }

        for (const person of people) {
          const apolloId = person?.id ?? null;
          if (!apolloId) {
            console.warn("Apollo phone webhook: person missing id", person);
            continue;
          }
          const phone = pickPhone(person.phone_numbers ?? null);

          const { data: cand, error: loadErr } = await supabaseAdmin
            .from("candidates")
            .select("id, user_id, phone, activity")
            .eq("apollo_id", apolloId)
            .maybeSingle();
          if (loadErr) {
            console.error("Apollo phone webhook: load failed", loadErr.message);
            continue;
          }
          if (!cand) {
            console.warn("Apollo phone webhook: no candidate for apollo_id", apolloId);
            continue;
          }
          if (cand.phone) {
            console.log("Apollo phone webhook: candidate already has phone", apolloId);
            continue;
          }

          const activity = Array.isArray(cand.activity) ? [...(cand.activity as any[])] : [];

          if (!phone) {
            activity.push({
              id: activity.length + 1,
              type: "phone_reveal_attempted",
              by: "apollo",
              when: "Just now",
              at: new Date().toISOString(),
              text: "Phone reveal completed — no number on file",
            });
            await supabaseAdmin.from("candidates").update({ activity }).eq("id", cand.id);
            continue;
          }

          activity.push({
            id: activity.length + 1,
            type: "phone_revealed",
            by: "apollo",
            when: "Just now",
            at: new Date().toISOString(),
            text: "Phone number revealed (5 credits used)",
          });

          const { error: updErr } = await supabaseAdmin
            .from("candidates")
            .update({ phone, activity })
            .eq("id", cand.id);
          if (updErr) {
            console.error("Apollo phone webhook: update failed", updErr.message);
            continue;
          }

          const { error: rpcErr } = await supabaseAdmin.rpc("increment_sourcing_usage", {
            _user_id: cand.user_id,
            _count: 5,
          });
          if (rpcErr) console.error("increment_sourcing_usage failed:", rpcErr.message);

          console.log("Apollo phone webhook: revealed", { apolloId });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});