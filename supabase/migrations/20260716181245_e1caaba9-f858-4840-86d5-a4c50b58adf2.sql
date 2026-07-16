
-- Search path + EXECUTE tightening
ALTER FUNCTION public.tg_set_updated_at() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_owner_or_admin(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

-- Tighten analytics insert (require user_id match when signed in; anon can log unauthenticated events with NULL user_id)
DROP POLICY IF EXISTS "anyone log event" ON public.analytics_events;
CREATE POLICY "log own or anon event" ON public.analytics_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- ai_providers: explicit deny-all policy so RLS coverage is complete (service_role bypasses RLS)
CREATE POLICY "ai_providers no direct access" ON public.ai_providers
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
