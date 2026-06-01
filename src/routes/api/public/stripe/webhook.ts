import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secrets = [
          process.env.STRIPE_WEBHOOK_SECRET,
          process.env.STRIPE_WEBHOOK_SECRET_PREVIEW,
        ].filter((s): s is string => Boolean(s));
        if (secrets.length === 0) {
          console.error("[stripe webhook] no STRIPE_WEBHOOK_SECRET* configured");
          return new Response("Webhook secret not configured", { status: 500 });
        }

        const signature = request.headers.get("stripe-signature");
        if (!signature) return new Response("Missing signature", { status: 400 });

        const body = await request.text();
        const stripe = getStripe();

        let event: Stripe.Event | null = null;
        let lastErr = "";
        for (const secret of secrets) {
          try {
            event = await stripe.webhooks.constructEventAsync(body, signature, secret);
            break;
          } catch (err) {
            lastErr = err instanceof Error ? err.message : String(err);
          }
        }
        if (!event) {
          console.error("[stripe webhook] signature verification failed:", lastErr);
          return new Response(`Invalid signature: ${lastErr}`, { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              // Subscription checkouts: persist customer id on the profile.
              // We DO NOT credit here — invoice.paid will fire right after and
              // call credits_refill_for_renewal idempotently.
              if (session.mode === "subscription") {
                const userId = session.metadata?.user_id;
                const customerId = typeof session.customer === "string"
                  ? session.customer
                  : session.customer?.id ?? null;
                if (userId && customerId) {
                  await (supabaseAdmin as any)
                    .from("profiles")
                    .update({ stripe_customer_id: customerId })
                    .eq("id", userId);
                }
                break;
              }
              // One-time top-up path: credit via existing RPC.
              const paymentIntentId =
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : session.payment_intent?.id ?? null;
              const { error } = await supabaseAdmin.rpc(
                "credit_purchase_complete" as never,
                {
                  _stripe_session_id: session.id,
                  _stripe_payment_intent: paymentIntentId,
                } as never,
              );
              if (error) {
                console.error("[stripe webhook] credit_purchase_complete:", error.message);
                return new Response(error.message, { status: 500 });
              }
              break;
            }
            case "invoice.paid": {
              const invoice = event.data.object as Stripe.Invoice & {
                subscription?: string | Stripe.Subscription | null;
              };
              const reason = invoice.billing_reason;
              if (
                reason !== "subscription_create" &&
                reason !== "subscription_cycle" &&
                reason !== "subscription_update"
              ) {
                break; // ignore one-off and manual invoices
              }
              const subId = typeof invoice.subscription === "string"
                ? invoice.subscription
                : invoice.subscription?.id ?? null;
              if (!subId) break;
              const stripeForFetch = getStripe();
              const sub = await stripeForFetch.subscriptions.retrieve(subId);
              const userId = sub.metadata?.user_id;
              const tierKey = sub.metadata?.tier_key;
              const credits = Number(sub.metadata?.credits ?? 0);
              if (!userId || !tierKey || !credits) {
                console.error("[stripe webhook] invoice.paid missing metadata", {
                  subId,
                });
                break;
              }
              const periodEndSec = (sub as unknown as { current_period_end?: number })
                .current_period_end;
              const periodEnd = periodEndSec
                ? new Date(periodEndSec * 1000).toISOString()
                : null;
              const { error: refillErr } = await supabaseAdmin.rpc(
                "credits_refill_for_renewal" as never,
                {
                  _user_id: userId,
                  _credits: credits,
                  _stripe_invoice_id: invoice.id,
                  _stripe_subscription_id: subId,
                  _period_end: periodEnd,
                } as never,
              );
              if (refillErr) {
                console.error("[stripe webhook] refill failed:", refillErr.message);
                return new Response(refillErr.message, { status: 500 });
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              const userId = sub.metadata?.user_id;
              const tierKey = sub.metadata?.tier_key;
              const credits = Number(sub.metadata?.credits ?? 0);
              const customerId = typeof sub.customer === "string"
                ? sub.customer
                : sub.customer.id;
              if (!userId || !tierKey || !credits) {
                console.error("[stripe webhook] subscription event missing metadata", {
                  id: sub.id,
                });
                break;
              }
              const periodStartSec = (sub as unknown as { current_period_start?: number })
                .current_period_start;
              const periodEndSec = (sub as unknown as { current_period_end?: number })
                .current_period_end;
              const status = event.type === "customer.subscription.deleted"
                ? "canceled"
                : sub.status;
              const { error: upErr } = await (supabaseAdmin as any)
                .from("subscriptions")
                .upsert(
                  {
                    user_id: userId,
                    stripe_customer_id: customerId,
                    stripe_subscription_id: sub.id,
                    tier_key: tierKey,
                    monthly_credits: credits,
                    status,
                    current_period_start: periodStartSec
                      ? new Date(periodStartSec * 1000).toISOString()
                      : null,
                    current_period_end: periodEndSec
                      ? new Date(periodEndSec * 1000).toISOString()
                      : null,
                    cancel_at_period_end: sub.cancel_at_period_end,
                  },
                  { onConflict: "stripe_subscription_id" },
                );
              if (upErr) {
                console.error("[stripe webhook] subscription upsert:", upErr.message);
                return new Response(upErr.message, { status: 500 });
              }
              break;
            }
            case "payment_intent.payment_failed": {
              const pi = event.data.object as Stripe.PaymentIntent;
              await supabaseAdmin
                .from("credit_purchases" as never)
                .update({ status: "failed" } as never)
                .eq("stripe_payment_intent", pi.id);
              break;
            }
            default:
              break;
          }
          return new Response("ok", { status: 200 });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[stripe webhook] handler error:", msg);
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});