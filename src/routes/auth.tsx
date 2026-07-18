import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        toast.success("Account created — check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/chat" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }




  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
      <a href="/" className="mb-6 text-sm text-muted-foreground">← Back</a>
      <div className="glass rounded-2xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icon-192.png" alt="" width={40} height={40} className="rounded-lg" />
          <div>
            <div className="text-lg font-bold text-gradient">AKIRA</div>
            <div className="text-xs text-muted-foreground">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </div>
          </div>
        </div>




        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Your name" className="h-11 w-full rounded-lg bg-input px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email" className="h-11 w-full rounded-lg bg-input px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" className="h-11 w-full rounded-lg bg-input px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            disabled={loading}
            className="animate-pulse-glow h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-muted-foreground"
        >
          {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
