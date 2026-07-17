import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { chatCompletion } from "@/lib/ai.functions";
import { getMyRole } from "@/lib/admin.functions";
import { toast } from "sonner";
import { Send, Mic, MicOff, Plus, LogOut, Shield, Crown, Volume2, Copy, Check } from "lucide-react";

type Message = { id: string; role: "user" | "assistant"; content: string; provider?: string };
type Conv = { id: string; title: string };

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

// IndexedDB-free simple offline cache using localStorage
const cacheKey = (uid: string, cid: string) => `akira:msgs:${uid}:${cid}`;

function ChatPage() {
  const { user } = Route.useRouteContext() as any;
  const chat = useServerFn(chatCompletion);
  const roleFn = useServerFn(getMyRole);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);

  // Load role
  useEffect(() => { roleFn().then((r: any) => setIsAdmin(r.isAdmin)).catch(() => {}); }, [roleFn]);

  // Load conversations
  useEffect(() => {
    supabase.from("conversations").select("id, title").order("updated_at", { ascending: false }).limit(50)
      .then(({ data }) => {
        setConvs((data ?? []) as Conv[]);
        if (data?.[0]) setActiveId(data[0].id);
        else newChat();
      });
  }, []);

  // Load messages for active conversation (with offline fallback)
  useEffect(() => {
    if (!activeId) return;
    const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey(user.id, activeId)) : null;
    if (cached) { try { setMessages(JSON.parse(cached)); } catch {} }
    supabase.from("messages").select("id, role, content, provider").eq("conversation_id", activeId).order("created_at")
      .then(({ data }) => {
        if (data) {
          setMessages(data as Message[]);
          try { localStorage.setItem(cacheKey(user.id, activeId), JSON.stringify(data)); } catch {}
        }
      });
  }, [activeId, user.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function newChat() {
    const { data } = await supabase.from("conversations").insert({ user_id: user.id, title: "New chat" }).select().single();
    if (data) { setConvs((c) => [data as Conv, ...c]); setActiveId(data.id); setMessages([]); }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !activeId) return;
    setInput("");
    setSending(true);
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    await supabase.from("messages").insert({ conversation_id: activeId, user_id: user.id, role: "user", content: text });

    try {
      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const result: any = await chat({ data: { conversationId: activeId, messages: history } });
      const asst: Message = { id: crypto.randomUUID(), role: "assistant", content: result.text, provider: result.provider };
      setMessages((m) => {
        const next = [...m, asst];
        try { localStorage.setItem(cacheKey(user.id, activeId), JSON.stringify(next)); } catch {}
        return next;
      });
      await supabase.from("messages").insert({
        conversation_id: activeId, user_id: user.id, role: "assistant",
        content: result.text, provider: result.provider, model: result.model,
      });
      // Update title from first message
      if (messages.length === 0) {
        const title = text.slice(0, 40);
        await supabase.from("conversations").update({ title }).eq("id", activeId);
        setConvs((c) => c.map((x) => (x.id === activeId ? { ...x, title } : x)));
      }
      if (voiceOn && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(result.text);
        speechSynthesis.speak(u);
      }
    } catch (e) {
      toast.error("AKIRA is offline for a moment. Try again shortly.");
    } finally {
      setSending(false);
    }
  }

  function toggleVoice() {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice input not supported in this browser."); return; }
    if (listening) { recRef.current?.stop(); return; }
    const r = new SR();
    r.lang = "en-US"; r.continuous = false; r.interimResults = true;
    r.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setInput(t);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    recRef.current = r;
    setListening(true);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Header */}
      <header className="glass sticky top-0 z-20 flex items-center gap-3 px-4 py-3">
        <button onClick={() => setSidebar(true)} className="rounded-lg p-2 hover:bg-muted" aria-label="Menu">
          <span className="block h-0.5 w-5 bg-foreground" />
          <span className="mt-1 block h-0.5 w-5 bg-foreground" />
          <span className="mt-1 block h-0.5 w-5 bg-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <img src="/icon-192.png" alt="" width={28} height={28} className="rounded-md" />
          <div className="text-sm font-bold text-gradient">AKIRA</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setVoiceOn(!voiceOn)} className={`rounded-lg p-2 ${voiceOn ? "text-primary" : "text-muted-foreground"}`} aria-label="TTS">
            <Volume2 size={18} />
          </button>
          {isAdmin && (
            <a href="/admin" className="rounded-lg p-2 text-accent" aria-label="Admin"><Shield size={18} /></a>
          )}
          <a href="/premium" className="rounded-lg p-2 text-muted-foreground" aria-label="Premium"><Crown size={18} /></a>
        </div>
      </header>

      {/* Sidebar drawer */}
      {sidebar && (
        <div className="fixed inset-0 z-30 flex">
          <div className="glass flex w-72 max-w-[85vw] flex-col p-4">
            <button onClick={newChat} className="mb-3 flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              <Plus size={16} /> New chat
            </button>
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Conversations</div>
            <div className="flex-1 space-y-1 overflow-auto">
              {convs.map((c) => (
                <button key={c.id} onClick={() => { setActiveId(c.id); setSidebar(false); }}
                  className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${c.id === activeId ? "bg-primary/20 text-primary" : "hover:bg-muted"}`}>
                  {c.title}
                </button>
              ))}
            </div>
            <button onClick={logout} className="mt-2 flex h-10 items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">
              <LogOut size={16} /> Sign out
            </button>
          </div>
          <div onClick={() => setSidebar(false)} className="flex-1 bg-background/50 backdrop-blur-sm" />
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto max-w-2xl space-y-3">
          {messages.length === 0 && (
            <div className="glass mt-10 rounded-2xl p-6 text-center">
              <div className="text-gradient text-lg font-bold">Hi, I'm AKIRA.</div>
              <div className="mt-1 text-xs text-muted-foreground">Ask me anything — I'll route across 10+ AI providers automatically.</div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "glass"}`}>
                {m.content}
                {m.provider && <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">via {m.provider}</div>}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="glass rounded-2xl px-4 py-3 text-sm">
                <span className="inline-flex gap-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:120ms]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      {/* Composer */}
      <div className="glass sticky bottom-0 z-20 px-3 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <button onClick={toggleVoice} className={`h-11 w-11 shrink-0 rounded-full ${listening ? "animate-pulse-glow bg-primary text-primary-foreground" : "bg-muted"}`} aria-label="Voice">
            {listening ? <MicOff size={18} className="mx-auto" /> : <Mic size={18} className="mx-auto" />}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message AKIRA…"
            rows={1}
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl bg-input px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={send} disabled={sending || !input.trim()} className="h-11 w-11 shrink-0 rounded-full bg-primary text-primary-foreground disabled:opacity-50" aria-label="Send">
            <Send size={18} className="mx-auto" />
          </button>
        </div>
      </div>
    </div>
  );
}
