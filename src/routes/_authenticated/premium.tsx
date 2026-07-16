import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/premium")({
  component: PremiumPage,
});

function PremiumPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    supabase.from("premium_plans").select("*").eq("active", true).order("price_ngn").then(({ data }) => setPlans(data ?? []));
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: p } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
        setMe(p);
      }
    });
  }, []);

  function subscribe(plan: any) {
    if (plan.price_ngn === 0) { toast.info("You're already on Free."); return; }
    toast.info("Paystack checkout will open here. Live keys are configured by the admin.");
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-16">
      <header className="glass sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 px-4 py-3">
        <a href="/chat" className="rounded-lg p-2 hover:bg-muted"><ArrowLeft size={18} /></a>
        <div className="text-sm font-bold text-gradient">Premium</div>
      </header>

      {me?.is_premium && (
        <div className="glass mb-4 rounded-2xl p-4 text-center">
          <Crown className="mx-auto text-primary" />
          <div className="mt-1 font-semibold text-gradient">You have Premium</div>
          <div className="text-xs text-muted-foreground">Enjoy priority routing and advanced features.</div>
        </div>
      )}

      <div className="space-y-3">
        {plans.map((p) => (
          <div key={p.id} className={`glass rounded-2xl p-5 ${p.code === "premium" ? "neon-border" : ""}`}>
            <div className="flex items-baseline justify-between">
              <div className="font-bold">{p.name}</div>
              <div className="text-2xl font-black text-gradient">
                {p.price_ngn === 0 ? "Free" : `₦${p.price_ngn.toLocaleString()}`}
                {p.price_ngn > 0 && <span className="text-xs text-muted-foreground"> / {p.interval}</span>}
              </div>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {(p.features as string[]).map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check size={14} className="mt-1 shrink-0 text-primary" /> {f}
                </li>
              ))}
            </ul>
            <button onClick={() => subscribe(p)}
              className="mt-4 h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
              {p.price_ngn === 0 ? "Current plan" : "Subscribe with Paystack"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
