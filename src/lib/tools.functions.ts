import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---------- Tavily web/location search ----------
export const tavilySearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().min(1),
        topic: z.enum(["general", "news"]).optional(),
        location: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return { results: [], answer: null, error: "TAVILY_API_KEY not configured" };
    try {
      const q = data.location ? `${data.query} near ${data.location}` : data.query;
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          query: q,
          topic: data.topic ?? "general",
          include_answer: "advanced",
          max_results: 8,
          search_depth: "advanced",
        }),
      });
      if (!res.ok) throw new Error(`Tavily ${res.status}`);
      const j: any = await res.json();
      return {
        answer: (j.answer ?? null) as string | null,
        results: (j.results ?? []).slice(0, 8).map((r: any) => ({
          title: r.title, url: r.url, content: r.content,
        })),
      };
    } catch (e) {
      return { results: [], answer: null, error: (e as Error).message };
    }
  });

// ---------- AI image generation (Lovable Gateway) ----------
export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ prompt: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Image generation unavailable");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: data.prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[akira] image gen failed", res.status, t);
      throw new Error("Image generation failed");
    }
    const j: any = await res.json();
    const b64 =
      j?.data?.[0]?.b64_json ??
      j?.choices?.[0]?.message?.images?.[0]?.image_url?.url?.split(",")[1] ??
      null;
    if (!b64) throw new Error("No image returned");
    return { dataUrl: `data:image/png;base64,${b64}` };
  });

// ---------- Vision Q&A on uploaded image ----------
export const visionAsk = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        prompt: z.string().min(1),
        imageDataUrl: z.string().startsWith("data:image/"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Vision unavailable");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: data.prompt },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[akira] vision failed", res.status, t);
      throw new Error("Vision request failed");
    }
    const j: any = await res.json();
    const text = j?.choices?.[0]?.message?.content ?? "";
    return { text: typeof text === "string" ? text : JSON.stringify(text) };
  });
