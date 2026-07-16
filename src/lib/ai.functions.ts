// AI chat + provider management server functions.
// This file is client-safe: only handler bodies run on the server.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

/**
 * Send a chat turn. Runs multi-provider failover across all enabled providers
 * (in priority order) and never surfaces provider errors to the client.
 */
export const chatCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid().nullable().optional(),
        messages: z.array(MessageSchema).min(1),
        systemPrompt: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callProvider } = await import("./providers.server");

    // Load enabled providers, priority ascending (lower = tried first)
    const { data: providers, error } = await supabaseAdmin
      .from("ai_providers")
      .select("id, provider, enabled, priority, api_key, default_model")
      .eq("enabled", true)
      .order("priority", { ascending: true });
    if (error) throw new Error("provider load failed");
    if (!providers?.length) throw new Error("No AI providers are enabled. Ask the administrator.");

    const msgs = [
      ...(data.systemPrompt ? [{ role: "system" as const, content: data.systemPrompt }] : []),
      ...data.messages,
    ];

    let lastErr: unknown = null;
    for (const p of providers) {
      try {
        const { text, model } = await callProvider(p as any, msgs);
        // analytics
        await supabaseAdmin.from("analytics_events").insert({
          user_id: context.userId,
          event: "ai_request",
          provider: p.provider,
          meta: { model },
        });
        return { text, provider: p.provider, model };
      } catch (e) {
        lastErr = e;
        console.error(`[akira] provider ${p.provider} failed:`, (e as Error).message);
        continue;
      }
    }
    console.error("[akira] all providers failed", lastErr);
    throw new Error("All AI providers are currently unavailable. Please try again shortly.");
  });

/** Admin: list all providers (returns api_key REDACTED). */
export const adminListProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "owner" || r.role === "admin")) throw new Error("Forbidden");

    const { data, error } = await supabaseAdmin
      .from("ai_providers")
      .select("id, provider, display_name, enabled, priority, default_model, api_key, last_status, last_checked_at")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({
      ...p,
      has_key: !!p.api_key,
      api_key: p.api_key ? "•".repeat(6) + p.api_key.slice(-4) : null,
    }));
  });

export const adminUpdateProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean().optional(),
        priority: z.number().int().optional(),
        default_model: z.string().nullable().optional(),
        api_key: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "owner" || r.role === "admin")) throw new Error("Forbidden");

    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.default_model !== undefined) patch.default_model = data.default_model;
    if (data.api_key !== undefined) patch.api_key = data.api_key === "" ? null : data.api_key;

    const { error } = await supabaseAdmin.from("ai_providers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminTestProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callProvider } = await import("./providers.server");
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "owner" || r.role === "admin")) throw new Error("Forbidden");

    const { data: row, error } = await supabaseAdmin
      .from("ai_providers")
      .select("id, provider, enabled, priority, api_key, default_model")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("not found");

    let status = "ok";
    let message = "connection successful";
    try {
      const r = await callProvider(row as any, [{ role: "user", content: "ping" }]);
      message = r.text.slice(0, 80);
    } catch (e) {
      status = "error";
      message = (e as Error).message.slice(0, 200);
    }
    await supabaseAdmin
      .from("ai_providers")
      .update({ last_status: `${status}: ${message}`, last_checked_at: new Date().toISOString() })
      .eq("id", data.id);
    return { status, message };
  });
