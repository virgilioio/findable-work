import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    // Only runs reliably on the client; the component below is the
    // authoritative gate so SSR never leaks protected content.
    if (typeof window === "undefined") return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AuthGate,
});

function AuthGate() {
  // During SSR we have no access to the user's session (it lives in
  // localStorage), so we MUST NOT render protected children. Render nothing
  // until the client verifies the session — otherwise anyone hitting
  // /app directly gets the full app HTML before any redirect fires.
  const [status, setStatus] = useState<"checking" | "authed">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data.user) {
        const redirectTo = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.replace(`/login?redirect=${redirectTo}`);
        return;
      }
      setStatus("authed");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status !== "authed") return null;
  return <Outlet />;
}