import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminListProviders, adminUpdateProvider, adminTestProvider } from "@/lib/ai.functions";
import { listUsers, getAnalytics, updatePlan, getMyRole } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Users, LineChart, Cog, Crown, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Tab = "providers" | "users" | "plans" | "analytics";

function AdminPage() {
  const listProv = useServerFn(adminListProviders);
  const updProv = useServerFn(adminUpdateProvider);
  const testProv = useServerFn(adminTestProvider);
  const usersFn = useServerFn(listUsers);
  const analyticsFn = useServerFn(getAnalytics);
  const planFn = useServerFn(updatePlan);
  const roleFn = useServerFn(getMyRole);

  const [tab, setTab] = useState<Tab>("providers");
  const [providers, setProviders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => { roleFn().then((r: any) => setAllowed(r.isAdmin)); }, [roleFn]);
  useEffect(() => { if (allowed) refresh(); }, [allowed, tab]);

  async function refresh() {
    try {
      if (tab === "providers") setProviders(await listProv() as any[]);
      if (tab === "users") setUsers(await usersFn() as any[]);
      if (tab === "analytics") setAnalytics(await analyticsFn());
      if (tab === "plans") {
        const { data } = await supabase.from("premium_plans").select("*").order("price_ngn");
        setPlans(data ?? []);
      }
    } catch (e) { toast.error((e as Error).message); }
  }

  if (allowed === false) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <div className="glass rounded-2xl p-6">
          <Shield className="mx-auto text-destructive" />
          <div className="mt-2 font-semibold">Not authorized</div>
          <a href="/chat" className="mt-4 inline-block text-sm text-primary">← Back to chat</a>
        </div>
      </div>
    );
  }
  if (allowed === null) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24">
      <header className="glass sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 px-4 py-3">
        <a href="/chat" className="rounded-lg p-2 hover:bg-muted"><ArrowLeft size={18} /></a>
        <div className="text-sm font-bold text-gradient">Admin</div>
      </header>

      <nav className="glass mb-4 flex overflow-x-auto rounded-2xl p-1 text-xs">
        {([
          ["providers", "Providers", Cog],
          ["users", "Users", Users],
          ["plans", "Plans", Crown],
          ["analytics", "Analytics", LineChart],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 ${tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>

      {tab === "providers" && (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{p.display_name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.provider}</div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={!!p.enabled}
                    onChange={async (e) => { await updProv({ data: { id: p.id, enabled: e.target.checked } }); refresh(); }} />
                  Enabled
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <label className="block">
                  <span className="text-muted-foreground">Priority</span>
                  <input type="number" defaultValue={p.priority}
                    onBlur={async (e) => { await updProv({ data: { id: p.id, priority: +e.target.value } }); }}
                    className="mt-1 h-9 w-full rounded-lg bg-input px-3" />
                </label>
                <label className="block">
                  <span className="text-muted-foreground">Model</span>
                  <input type="text" defaultValue={p.default_model ?? ""}
                    onBlur={async (e) => { await updProv({ data: { id: p.id, default_model: e.target.value } }); }}
                    className="mt-1 h-9 w-full rounded-lg bg-input px-3" />
                </label>
                <div className="col-span-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-muted-foreground">API Key</span>
                    {p.has_key ? (
                      <span className="text-[10px] text-primary">saved · {p.api_key}</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        {p.provider === "lovable" ? "not required" : "not set"}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      id={`key-${p.id}`}
                      type="password"
                      placeholder={p.has_key ? "Paste new key to replace" : "Paste API key"}
                      className="h-9 flex-1 rounded-lg bg-input px-3"
                    />
                    <button
                      onClick={async () => {
                        const el = document.getElementById(`key-${p.id}`) as HTMLInputElement;
                        const v = el?.value?.trim();
                        if (!v) return toast.error("Enter a key first");
                        await updProv({ data: { id: p.id, api_key: v } });
                        el.value = "";
                        toast.success("Key saved");
                        refresh();
                      }}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      Save
                    </button>
                    {p.has_key && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Remove API key for ${p.display_name}?`)) return;
                          await updProv({ data: { id: p.id, api_key: "" } });
                          toast.success("Key removed");
                          refresh();
                        }}
                        className="rounded-lg border border-destructive px-3 py-1.5 text-xs text-destructive"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={async () => {
                  const r = await testProv({ data: { id: p.id } }) as any;
                  (r.status === "ok" ? toast.success : toast.error)(`${p.display_name}: ${r.message}`);
                  refresh();
                }} className="rounded-lg bg-muted px-3 py-1.5 text-xs">Test connection</button>
                {p.last_status && <span className="ml-auto truncate text-[10px] text-muted-foreground">{p.last_status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "users" && (
        <div className="glass rounded-2xl">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-border p-3 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">{u.display_name || u.email}</div>
                <div className="truncate text-xs text-muted-foreground">{u.email}</div>
              </div>
              {u.is_premium && <Crown size={14} className="text-primary" />}
            </div>
          ))}
        </div>
      )}

      {tab === "plans" && (
        <div className="space-y-3">
          {plans.map((p) => (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{p.name}</div>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" defaultChecked={p.active}
                  onChange={async (e) => { await planFn({ data: { id: p.id, active: e.target.checked } }); }} /> Active</label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <label>Price (₦)<input type="number" defaultValue={p.price_ngn}
                  onBlur={async (e) => { await planFn({ data: { id: p.id, price_ngn: +e.target.value } }); toast.success("Saved"); }}
                  className="mt-1 h-9 w-full rounded-lg bg-input px-3" /></label>
                <label>Discount %<input type="number" defaultValue={p.discount_percent}
                  onBlur={async (e) => { await planFn({ data: { id: p.id, discount_percent: +e.target.value } }); }}
                  className="mt-1 h-9 w-full rounded-lg bg-input px-3" /></label>
              </div>
              <label className="mt-2 block text-xs">Features (one per line)
                <textarea defaultValue={(p.features as string[]).join("\n")} rows={4}
                  onBlur={async (e) => {
                    await planFn({ data: { id: p.id, features: e.target.value.split("\n").filter(Boolean) } });
                    toast.success("Saved");
                  }}
                  className="mt-1 w-full rounded-lg bg-input p-3" />
              </label>
            </div>
          ))}
        </div>
      )}

      {tab === "analytics" && analytics && (
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Visitors", analytics.visits],
            ["Users", analytics.users],
            ["Premium", analytics.premium],
            ["AI Requests", analytics.aiRequests],
          ].map(([k, v]) => (
            <div key={k as string} className="glass rounded-2xl p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{k as string}</div>
              <div className="mt-1 text-3xl font-black text-gradient">{v as number}</div>
            </div>
          ))}
          <div className="glass col-span-2 rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Provider usage</div>
            <div className="mt-2 space-y-1 text-sm">
              {Object.entries(analytics.providerBreakdown as Record<string, number>).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span><span className="font-mono">{v}</span>
                </div>
              ))}
              {Object.keys(analytics.providerBreakdown).length === 0 && (
                <div className="text-xs text-muted-foreground">No AI requests yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
