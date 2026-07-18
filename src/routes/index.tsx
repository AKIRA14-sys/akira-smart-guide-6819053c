import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
});


function Landing() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-40" aria-hidden>
        <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
      </div>

      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <img src="/icon-192.png" alt="" width={96} height={96} className="animate-float rounded-2xl glow" />
        <h1 className="mt-6 text-5xl font-black tracking-tight">
          <span className="text-gradient">AKIRA</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your futuristic AI, powered by 10+ models with automatic failover, voice, memory, and offline support.
        </p>

        <div className="mt-10 flex w-full flex-col gap-3">
          <a
            href="/auth"
            className="animate-pulse-glow flex h-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            Get started
          </a>
          <button
            onClick={async () => {
              const { data } = await supabase.auth.getSession();
              window.location.href = data.session ? "/chat" : "/auth";
            }}
            className="glass h-12 rounded-xl text-sm font-medium text-foreground"
          >
            I already have an account
          </button>
        </div>

        <ul className="mt-12 grid w-full grid-cols-2 gap-3 text-left text-xs">
          {[
            ["Multi-provider", "10+ AI models with failover"],
            ["Voice", "Speech in and out"],
            ["Offline-first", "Installable PWA"],
            ["Memory", "AI remembers you"],
          ].map(([t, s]) => (
            <li key={t} className="glass rounded-xl p-3">
              <div className="text-gradient font-semibold">{t}</div>
              <div className="mt-0.5 text-muted-foreground">{s}</div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
