import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { chatCompletion } from "@/lib/ai.functions";
import { tavilySearch, generateImage, visionAsk } from "@/lib/tools.functions";
import { toast } from "sonner";
import { Send, Mic, Plus, Volume2, Copy, Check, Globe, Image as ImageIcon, Paperclip, Trash2, MapPin } from "lucide-react";

type Message = { id: string; role: "user" | "assistant"; content: string; provider?: string };
type Conv = { id: string; title: string };

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

const cacheKey = (uid: string, cid: string) => `akira:msgs:${uid}:${cid}`;

function ChatPage() {
  const chat = useServerFn(chatCompletion);
  const tavily = useServerFn(tavilySearch);
  const genImg = useServerFn(generateImage);
  const vision = useServerFn(visionAsk);

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
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function deleteChat(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await supabase.from("messages").delete().eq("conversation_id", id);
    await supabase.from("conversations").delete().eq("id", id);
    if (userId) { try { localStorage.removeItem(cacheKey(userId, id)); } catch {} }
    setConvs((c) => c.filter((x) => x.id !== id));
    if (activeId === id) {
      const remaining = convs.filter((x) => x.id !== id);
      if (remaining[0]) setActiveId(remaining[0].id);
      else { setActiveId(null); setMessages([]); await newChat(); }
    }
    toast.success("Chat deleted");
  }

  async function persist(role: "user" | "assistant", content: string, extra: Record<string, any> = {}) {
    if (!activeId || !userId) return;
    await supabase.from("messages").insert({ conversation_id: activeId, user_id: userId, role, content, ...extra });
  }

  async function send() {
    const text = input.trim();
    if ((!text && !pendingImage) || sending || !activeId || !userId) return;
    setInput("");
    setSending(true);
    const attachedImage = pendingImage;
    setPendingImage(null);

    const displayContent = attachedImage ? `${text || "Describe this image"}\n\n![upload](${attachedImage})` : text;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: displayContent };
    setMessages((m) => [...m, userMsg]);
    await persist("user", displayContent);

    try {
      let replyText: string;
      let provider = "lovable";
      let model: string | undefined;
      if (attachedImage) {
        const r: any = await vision({ data: { prompt: text || "Describe this image in detail.", imageDataUrl: attachedImage } });
        replyText = r.text;
        provider = "vision";
      } else {
        const history = [...messages, { role: "user" as const, content: text }].map(({ role, content }) => ({ role, content }));
        const result: any = await chat({ data: { conversationId: activeId, messages: history } });
        replyText = result.text; provider = result.provider; model = result.model;
      }
      const asst: Message = { id: crypto.randomUUID(), role: "assistant", content: replyText, provider };
      setMessages((m) => {
        const next = [...m, asst];
        try { localStorage.setItem(cacheKey(userId, activeId), JSON.stringify(next)); } catch {}
        return next;
      });
      await persist("assistant", replyText, { provider, model });
      if (messages.length === 0 && text) {
        const title = text.slice(0, 40);
        await supabase.from("conversations").update({ title }).eq("id", activeId);
        setConvs((c) => c.map((x) => (x.id === activeId ? { ...x, title } : x)));
      }
      if (voiceOn && "speechSynthesis" in window) {
        speechSynthesis.speak(new SpeechSynthesisUtterance(replyText));
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
    r.onresult = (e: any) => setInput(Array.from(e.results).map((r: any) => r[0].transcript).join(""));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    recRef.current = r;
    setListening(true);
  }

  async function runWebSearch(withLocation: boolean) {
    const q = input.trim();
    if (!q || sending) return;
    let location: string | undefined;
    if (withLocation) {
      location = prompt("Search near which location? (city, address, or leave blank)") || undefined;
    }
    setSending(true);
    try {
      const res: any = await tavily({ data: { query: q, location } });
      const lines: string[] = [];
      if (res.answer) lines.push(`**Answer:** ${res.answer}`, "");
      for (const r of res.results ?? []) lines.push(`• [${r.title}](${r.url})\n  ${r.content}`);
      const content = lines.length ? lines.join("\n") : (res.error ?? "No results.");
      const prefix = withLocation && location ? `📍 Search near ${location}: ${q}` : `🌐 Web search: ${q}`;
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", content: prefix },
        { id: crypto.randomUUID(), role: "assistant", content, provider: "tavily" },
      ]);
      await persist("user", prefix);
      await persist("assistant", content, { provider: "tavily" });
      setInput("");
    } catch { toast.error("Search failed."); } finally { setSending(false); }
  }

  async function runImageGen() {
    const q = input.trim();
    if (!q || sending) return;
    setSending(true);
    try {
      const res: any = await genImg({ data: { prompt: q } });
      const userLine = `🎨 Generate: ${q}`;
      const asstLine = `![generated](${res.dataUrl})`;
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", content: userLine },
        { id: crypto.randomUUID(), role: "assistant", content: asstLine, provider: "lovable-image" },
      ]);
      await persist("user", userLine);
      await persist("assistant", asstLine, { provider: "lovable-image" });
      setInput("");
    } catch { toast.error("Image generation failed."); } finally { setSending(false); }
  }

  async function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Only image uploads are supported."); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error("Image too large (max 8MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result as string);
    reader.readAsDataURL(f);
    toast.success("Image attached — ask a question and send.");
  }

  async function copyMsg(m: Message) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { toast.error("Copy failed"); }
  }

  // Very small markdown renderer for images + links (safe subset)
  function renderContent(text: string) {
    const parts: (string | { img: string } | { link: string; label: string })[] = [];
    const re = /!\[[^\]]*\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      if (m[1]) parts.push({ img: m[1] });
      else if (m[2] && m[3]) parts.push({ link: m[3], label: m[2] });
      last = re.lastIndex;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.map((p, i) =>
      typeof p === "string" ? <span key={i}>{p}</span>
      : "img" in p ? <img key={i} src={p.img} alt="" className="my-2 max-h-80 rounded-lg" />
      : <a key={i} href={p.link} target="_blank" rel="noreferrer" className="text-primary underline">{p.label}</a>
    );
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
          {activeId && (
            <button onClick={() => deleteChat(activeId)} className="rounded-lg p-2 text-muted-foreground hover:text-destructive" aria-label="Delete chat">
              <Trash2 size={18} />
            </button>
          )}
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
                <div key={c.id} className={`group flex items-center gap-1 rounded-lg ${c.id === activeId ? "bg-primary/20" : "hover:bg-muted"}`}>
                  <button onClick={() => { setActiveId(c.id); setSidebar(false); }}
                    className={`flex-1 truncate px-3 py-2 text-left text-sm ${c.id === activeId ? "text-primary" : ""}`}>
                    {c.title}
                  </button>
                  <button onClick={() => deleteChat(c.id)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
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
              <p className="mt-2 text-sm text-muted-foreground">Chat, search the web, find nearby places, generate images, or upload a photo to ask about.</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`group relative max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "glass"}`}>
                {renderContent(m.content)}
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
        <div className="mx-auto max-w-2xl">
          {pendingImage && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/40 p-2">
              <img src={pendingImage} alt="" className="h-12 w-12 rounded object-cover" />
              <span className="flex-1 text-xs text-muted-foreground">Image attached</span>
              <button onClick={() => setPendingImage(null)} className="text-xs text-destructive">Remove</button>
            </div>
          )}
          <div className="mb-2 flex flex-wrap gap-1 text-xs">
            <button onClick={() => runWebSearch(false)} className="flex items-center gap-1 rounded-full bg-muted/40 px-3 py-1 hover:bg-muted"><Globe size={12} /> Web</button>
            <button onClick={() => runWebSearch(true)} className="flex items-center gap-1 rounded-full bg-muted/40 px-3 py-1 hover:bg-muted"><MapPin size={12} /> Near me</button>
            <button onClick={runImageGen} className="flex items-center gap-1 rounded-full bg-muted/40 px-3 py-1 hover:bg-muted"><ImageIcon size={12} /> Generate image</button>
          </div>
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFilePick} />
            <button onClick={() => fileRef.current?.click()} className="rounded-lg p-2 text-muted-foreground hover:text-foreground" aria-label="Attach"><Paperclip size={18} /></button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder="Message AKIRA…"
              className="min-h-10 flex-1 resize-none rounded-xl bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={toggleVoice} className={`rounded-lg p-2 ${listening ? "text-primary" : "text-muted-foreground"}`} aria-label="Mic"><Mic size={18} /></button>
            <button onClick={send} disabled={sending || (!input.trim() && !pendingImage)} className="rounded-xl bg-primary p-2 text-primary-foreground disabled:opacity-50" aria-label="Send"><Send size={18} /></button>
          </div>
        </div>
      </footer>
    </div>
  );
}
