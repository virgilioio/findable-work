import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = Array.isArray(value) ? value.join("; ") : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const COLUMNS: { key: string; header: string }[] = [
  { key: "name", header: "Name" },
  { key: "role", header: "Role" },
  { key: "company", header: "Company" },
  { key: "location", header: "Location" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
  { key: "linkedin", header: "LinkedIn" },
  { key: "source", header: "Source" },
  { key: "stage", header: "Stage" },
  { key: "tags", header: "Tags" },
  { key: "starred", header: "Starred" },
  { key: "created_at", header: "Created At" },
];

export const exportCandidatesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ csv: string; count: number }> => {
    const { supabase, userId } = context;
    // RLS already restricts to this user; the explicit filter is defense in depth.
    const { data, error } = await (supabase as any)
      .from("candidates")
      .select(
        "name, role, company, location, email, phone, linkedin, source, stage, tags, starred, created_at, is_locked, user_id",
      )
      .eq("user_id", userId)
      .eq("is_locked", false)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    const lines = [COLUMNS.map((c) => csvEscape(c.header)).join(",")];
    for (const row of rows) {
      lines.push(COLUMNS.map((c) => csvEscape(row[c.key])).join(","));
    }
    return { csv: lines.join("\n"), count: rows.length };
  });