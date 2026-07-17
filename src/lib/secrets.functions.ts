import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(ctx: any) {
  const { data: roles } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!roles?.some((r: any) => r.role === "owner" || r.role === "admin")) throw new Error("Forbidden");
}

export const listAppSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_secrets")
      .select("id, name, value, description, updated_at")
      .order("name");
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      updated_at: r.updated_at,
      has_value: !!r.value,
      masked: r.value ? "•".repeat(6) + r.value.slice(-4) : null,
    }));
  });

export const upsertAppSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(256).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use only letters, numbers, and underscores"),
      value: z.string().max(24576).optional(),
      description: z.string().max(500).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const patch: any = {};
      if (data.value !== undefined) patch.value = data.value;
      if (data.description !== undefined) patch.description = data.description;
      if (data.name) patch.name = data.name;
      const { error } = await supabaseAdmin.from("app_secrets").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("app_secrets").insert({
        name: data.name,
        value: data.value ?? "",
        description: data.description ?? null,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteAppSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_secrets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
