// Server-only provider adapters for the AKIRA AI system.
// This file must ONLY be imported inside server function handlers via `await import()`.

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
export type ProviderRow = {
  id: string;
  provider: string;
  enabled: boolean;
  priority: number;
  api_key: string | null;
  default_model: string | null;
};

export type ProviderResult = { text: string; model: string };

async function openaiCompatible(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMsg[];
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
      ...(opts.extraHeaders ?? {}),
    },
    body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: false }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  const j: any = await res.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty response");
  return text as string;
}

async function callGemini(apiKey: string, model: string, messages: ChatMsg[]): Promise<string> {
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const systemInstruction = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n") || undefined;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  const j: any = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  if (!text) throw new Error("empty response");
  return text;
}

async function callCohere(apiKey: string, model: string, messages: ChatMsg[]): Promise<string> {
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  const j: any = await res.json();
  const text = j?.message?.content?.[0]?.text ?? j?.text ?? "";
  if (!text) throw new Error("empty response");
  return text;
}

async function callHuggingFace(apiKey: string, model: string, messages: ChatMsg[]): Promise<string> {
  // Try OpenAI-compatible router first (works for many text-generation models)
  return openaiCompatible({
    baseUrl: "https://router.huggingface.co/v1",
    apiKey,
    model,
    messages,
  });
}

async function callCloudflare(apiKey: string, model: string, messages: ChatMsg[], accountId: string): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  const j: any = await res.json();
  const text = j?.result?.response ?? j?.result?.[0]?.response ?? "";
  if (!text) throw new Error("empty response");
  return text;
}

async function callLovable(model: string, messages: ChatMsg[]): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("no lovable key");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  const j: any = await res.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty response");
  return text as string;
}

export async function callProvider(row: ProviderRow, messages: ChatMsg[]): Promise<ProviderResult> {
  const model = row.default_model ?? "";
  switch (row.provider) {
    case "lovable":
      return { text: await callLovable(model || "google/gemini-2.5-flash", messages), model };
    case "gemini":
      if (!row.api_key) throw new Error("no key");
      return { text: await callGemini(row.api_key, model || "gemini-2.0-flash", messages), model };
    case "groq":
      if (!row.api_key) throw new Error("no key");
      return {
        text: await openaiCompatible({
          baseUrl: "https://api.groq.com/openai/v1",
          apiKey: row.api_key,
          model: model || "llama-3.3-70b-versatile",
          messages,
        }),
        model,
      };
    case "openrouter":
      if (!row.api_key) throw new Error("no key");
      return {
        text: await openaiCompatible({
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: row.api_key,
          model: model || "meta-llama/llama-3.1-70b-instruct",
          messages,
          extraHeaders: { "HTTP-Referer": "https://akira.app", "X-Title": "AKIRA" },
        }),
        model,
      };
    case "mistral":
      if (!row.api_key) throw new Error("no key");
      return {
        text: await openaiCompatible({
          baseUrl: "https://api.mistral.ai/v1",
          apiKey: row.api_key,
          model: model || "mistral-small-latest",
          messages,
        }),
        model,
      };
    case "cerebras":
      if (!row.api_key) throw new Error("no key");
      return {
        text: await openaiCompatible({
          baseUrl: "https://api.cerebras.ai/v1",
          apiKey: row.api_key,
          model: model || "llama3.1-70b",
          messages,
        }),
        model,
      };
    case "sambanova":
      if (!row.api_key) throw new Error("no key");
      return {
        text: await openaiCompatible({
          baseUrl: "https://api.sambanova.ai/v1",
          apiKey: row.api_key,
          model: model || "Meta-Llama-3.1-70B-Instruct",
          messages,
        }),
        model,
      };
    case "nvidia":
      if (!row.api_key) throw new Error("no key");
      return {
        text: await openaiCompatible({
          baseUrl: "https://integrate.api.nvidia.com/v1",
          apiKey: row.api_key,
          model: model || "meta/llama-3.1-70b-instruct",
          messages,
        }),
        model,
      };
    case "cohere":
      if (!row.api_key) throw new Error("no key");
      return { text: await callCohere(row.api_key, model || "command-r", messages), model };
    case "huggingface":
      if (!row.api_key) throw new Error("no key");
      return { text: await callHuggingFace(row.api_key, model || "meta-llama/Meta-Llama-3-8B-Instruct", messages), model };
    case "cloudflare": {
      if (!row.api_key) throw new Error("no key");
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
      if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID not set");
      return { text: await callCloudflare(row.api_key, model || "@cf/meta/llama-3.1-70b-instruct", messages, accountId), model };
    }
    default:
      throw new Error(`unknown provider ${row.provider}`);
  }
}
