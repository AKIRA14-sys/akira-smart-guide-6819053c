import { createServerFn } from "@tanstack/react-start";

async function getSerpKey(): Promise<string> {
  const envKey = process.env.SERPAPI_API_KEY;
  if (envKey) return envKey;
  // Fallback to app_secrets table (admin-managed)
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL!;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, svc, { auth: { persistSession: false } });
  const { data } = await admin.from("app_secrets").select("value").eq("name", "SERPAPI_API_KEY").maybeSingle();
  if (!data?.value) throw new Error("SERPAPI_API_KEY is not configured");
  return data.value as string;
}

export const webSearchSerp = createServerFn({ method: "POST" })
  .inputValidator((d: { query: string }) => d)
  .handler(async ({ data }) => {
    try {
      const key = await getSerpKey();
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google");
      url.searchParams.set("q", data.query);
      url.searchParams.set("api_key", key);
      url.searchParams.set("num", "8");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
      const j: any = await res.json();
      const results = (j.organic_results ?? []).slice(0, 8).map((r: any) => ({
        title: r.title as string,
        link: r.link as string,
        snippet: (r.snippet ?? "") as string,
      }));
      const answer_box = j.answer_box?.answer || j.answer_box?.snippet || null;
      return { results, answer_box };
    } catch (e) {
      return { results: [], answer_box: null, error: (e as Error).message };
    }
  });

export const imageSearchSerp = createServerFn({ method: "POST" })
  .inputValidator((d: { query: string }) => d)
  .handler(async ({ data }) => {
    try {
      const key = await getSerpKey();
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_images");
      url.searchParams.set("q", data.query);
      url.searchParams.set("api_key", key);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
      const j: any = await res.json();
      const images = (j.images_results ?? []).slice(0, 12).map((r: any) => ({
        thumbnail: r.thumbnail as string,
        original: (r.original ?? r.thumbnail) as string,
        title: (r.title ?? "") as string,
        source: (r.source ?? r.link ?? "") as string,
      }));
      return { images };
    } catch (e) {
      return { images: [], error: (e as Error).message };
    }
  });
