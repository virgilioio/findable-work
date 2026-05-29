import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public, unauthenticated read of a published job — only safe columns.
export const Route = createFileRoute("/api/public/jobs/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = String(params.slug || "").slice(0, 200);
        if (!slug) return new Response("Not found", { status: 404 });

        const { data, error } = await supabaseAdmin
          .from("jobs")
          .select(
            "id, slug, title, company, location, employment_type, salary_min, salary_max, currency, summary, description, requirements, responsibilities, must_have, nice_to_have, screening, published, published_at",
          )
          .eq("slug", slug)
          .maybeSingle();

        if (error) {
          console.error("[public job] read error", error.message);
          return new Response("Error", { status: 500 });
        }
        if (!data || !data.published) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        return Response.json(data, {
          headers: { "Cache-Control": "public, max-age=30, s-maxage=60" },
        });
      },
    },
  },
});