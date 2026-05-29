import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SELECT =
  "id, slug, title, company, location, employment_type, salary_min, salary_max, currency, summary, description, requirements, responsibilities, must_have, nice_to_have, screening, published, published_at";

export const getPublicJob = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ slug: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("jobs")
      .select(SELECT)
      .eq("slug", data.slug)
      .eq("published", true)
      .maybeSingle();
    if (error) {
      console.error("[getPublicJob] read error", error.message);
      throw new Error("Failed to load job");
    }
    return row ?? null;
  });