
CREATE TABLE public.app_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_secrets TO authenticated;
GRANT ALL ON public.app_secrets TO service_role;
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage app_secrets" ON public.app_secrets FOR ALL TO authenticated
  USING (public.is_owner_or_admin(auth.uid())) WITH CHECK (public.is_owner_or_admin(auth.uid()));
CREATE TRIGGER app_secrets_updated_at BEFORE UPDATE ON public.app_secrets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
INSERT INTO public.app_secrets (name, description) VALUES
  ('TAVILY_API_KEY', 'Tavily web search API key'),
  ('BRAVE_API_KEY', 'Brave web search API key'),
  ('SERPAPI_API_KEY', 'SerpAPI web search API key')
ON CONFLICT (name) DO NOTHING;
