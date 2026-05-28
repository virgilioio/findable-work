import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      console.info("[auth] _authenticated guard redirecting to /login", {
        from: location.href,
      });
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: () => <Outlet />,
});