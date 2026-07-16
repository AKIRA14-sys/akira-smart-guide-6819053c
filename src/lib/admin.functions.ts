import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "owner" || r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, is_premium, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    return data ?? [];
  });

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "owner" || r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [users, premium, aiReq, visits, providerBreakdown] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("is_premium", true),
      supabaseAdmin.from("analytics_events").select("id", { count: "exact", head: true }).eq("event", "ai_request"),
      supabaseAdmin.from("analytics_events").select("id", { count: "exact", head: true }).eq("event", "visit"),
      supabaseAdmin.from("analytics_events").select("provider").eq("event", "ai_request").limit(2000),
    ]);
    const provAgg: Record<string, number> = {};
    for (const r of providerBreakdown.data ?? []) {
      const p = (r as any).provider ?? "unknown";
      provAgg[p] = (provAgg[p] ?? 0) + 1;
    }
    return {
      users: users.count ?? 0,
      premium: premium.count ?? 0,
      aiRequests: aiReq.count ?? 0,
      visits: visits.count ?? 0,
      providerBreakdown: provAgg,
    };
  });

export const updatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().optional(),
        price_ngn: z.number().int().min(0).optional(),
        discount_percent: z.number().int().min(0).max(100).optional(),
        features: z.array(z.string()).optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "owner" || r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { ...data };
    delete patch.id;
    if (data.features) patch.features = data.features;
    const { error } = await supabaseAdmin.from("premium_plans").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const roles = (data ?? []).map((r) => r.role);
    return {
      isOwner: roles.includes("owner"),
      isAdmin: roles.includes("owner") || roles.includes("admin"),
    };
  });
