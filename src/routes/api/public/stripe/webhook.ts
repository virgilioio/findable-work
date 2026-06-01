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