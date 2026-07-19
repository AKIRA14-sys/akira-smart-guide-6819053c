import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { chatCompletion } from "@/lib/ai.functions";
import { webSearchSerp, imageSearchSerp } from "@/lib/serpapi.functions";
import { toast } from "sonner";
import { Send, Mic, Plus, Volume2, Copy, Check, Globe, Image as ImageIcon } from "lucide-react";

type Message = { id: string; role: "user" | "assistant"; content: string; provider?: string };
type Conv = { id: string; title: string };

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

const cacheKey = (uid: string, cid: string) => `akira:msgs:${uid}:${cid}`;

function ChatPage() {
  const chat = useServerFn(chatCompletion);
  const webSearch = useServerFn(webSearchSerp);
  const imgSearch = useServerFn(imageSearchSerp);

  const [userId, setUserId] = useState<string | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);

  // Ensure a session (anonymous is fine)
  useEffect(() => {
    (async () => {
      let { data } = await supabase.auth.getSession();
      if (!data.session) {
        try { await supabase.auth.signInAnonymously(); } catch {}
        ({ data } = await supabase.auth.getSession());
      }
      setUserId(data.session?.user.id ?? null);
    })();
  }, []);

  // Load conversations once we have a user
  useEffect(() => {
    if (!userId) return;
    supabase.from("conversations").select("id, title").order("updated_at", { ascending: false }).limit(50)
      .then(({ data }) => {
        setConvs((data ?? []) as Conv[]);
        if (data?.[0]) setActiveId(data[0].id);
        else newChat();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!activeId || !userId) return;
    const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey(userId, activeId)) : null;
    if (cached) { try { setMessages(JSON.parse(cached)); } catch {} }
    supabase.from("messages").select("id, role, content, provider").eq("conversation_id", activeId).order("created_at")
      .then(({ data }) => {
        if (data) {
          setMessages(data as Message[]);
          try { localStorage.setItem(cacheKey(userId, activeId), JSON.stringify(data)); } catch {}
        }
      });
  }, [activeId, userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function newChat() {
    if (!userId) return;
    const { data } = await supabase.from("conversations").insert({ user_id: userId, title: "New chat" }).select().single();
    if (data) { setConvs((c) => [data as Conv, ...c]); setActiveId(data.id); setMessages([]); setSidebar(false); }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !activeId || !userId) return;
    setInput("");
    setSending(true);
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    await supabase.from("messages").insert({ conversation_id: activeId, user_id: userId, role: "user", content: text });

    try {
      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const result: any = await chat({ data: { conversationId: activeId, messages: history } });
      const asst: Message = { id: crypto.randomUUID(), role: "assistant", content: result.text, provider: result.provider };
      setMessages((m) => {
        const next = [...m, asst];
        try { localStorage.setItem(cacheKey(userId, activeId), JSON.stringify(next)); } catch {}
        return next;
      });
      await supabase.from("messages").insert({
        conversation_id: activeId, user_id: userId, role: "assistant",
        content: result.text, provider: result.provider, model: result.model,
      });
      if (messages.length === 0) {
        const title = text.slice(0, 40);
        await supabase.from("conversations").update({ title }).eq("id", activeId);
        setConvs((c) => c.map((x) => (x.id === activeId ? { ...x, title } : x)));
      }
      if (voiceOn && "speechSynthesis" in window) {
        speechSynthesis.speak(new SpeechSynthesisUtterance(result.text));
      }
    } catch {
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

  async function runWebSearch() {
    const q = input.trim();
    if (!q || sending) return;
    setSending(true);
    try {
      const res: any = await webSearch({ data: { query: q } });
      const lines: string[] = [];
      if (res.answer_box) lines.push(`**Answer:** ${res.answer_box}`, "");
      for (const r of res.results ?? []) lines.push(`• ${r.title}\n  ${r.link}\n  ${r.snippet}`);
      const content = lines.length ? lines.join("\n") : "No results.";
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", content: `🌐 Web search: ${q}` },
        { id: crypto.randomUUID(), role: "assistant", content, provider: "serpapi" },
      ]);
      setInput("");
    } catch { toast.error("Search failed."); } finally { setSending(false); }
  }

  async function runImageSearch() {
    const q = input.trim();
    if (!q || sending) return;
    setSending(true);
    try {
      const res: any = await imgSearch({ data: { query: q } });
      const imgs = (res.images ?? []).slice(0, 8);
      const md = imgs.length ? imgs.map((i: any) => `![${i.title}](${i.thumbnail})`).join(" ") : "No images.";
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", content: `🖼 Image search: ${q}` },
        { id: crypto.randomUUID(), role: "assistant", content: md, provider: "serpapi" },
      ]);
      setInput("");
    } catch { toast.error("Image search failed."); } finally { setSending(false); }
  }

  async function copyMsg(m: Message) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { toast.error("Copy failed"); }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
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
        </div>
      </header>

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
          </div>
          <div onClick={() => setSidebar(false)} className="flex-1 bg-background/50 backdrop-blur-sm" />
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto max-w-2xl space-y-3">
          {messages.length === 0 && (
            <div className="glass mt-10 rounded-2xl p-6 text-center">
              <div className="text-gradient text-lg font-bold">Hi, I'm AKIRA.</div>
              <p className="mt-2 text-sm text-muted-foreground">Ask me anything, search the web, or find images.</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`group relative max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "glass"}`}>
                {m.content}
                {m.role === "assistant" && (
                  <button onClick={() => copyMsg(m)} className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Copy">
                    {copiedId === m.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="glass sticky bottom-0 z-10 border-t border-border/50 px-3 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <button onClick={runWebSearch} className="rounded-lg p-2 text-muted-foreground hover:text-foreground" aria-label="Web search"><Globe size={18} /></button>
          <button onClick={runImageSearch} className="rounded-lg p-2 text-muted-foreground hover:text-foreground" aria-label="Image search"><ImageIcon size={18} /></button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder="Message AKIRA…"
            className="min-h-10 flex-1 resize-none rounded-xl bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={toggleVoice} className={`rounded-lg p-2 ${listening ? "text-primary" : "text-muted-foreground"}`} aria-label="Mic"><Mic size={18} /></button>
          <button onClick={send} disabled={sending || !input.trim()} className="rounded-xl bg-primary p-2 text-primary-foreground disabled:opacity-50" aria-label="Send"><Send size={18} /></button>
        </div>
      </footer>
    </div>
  );
}
