CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_owner_count int;
  is_anon boolean := COALESCE(NEW.is_anonymous, false);
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,''),'@',1), 'Guest'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  IF is_anon THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  ELSE
    SELECT count(*) INTO existing_owner_count FROM public.user_roles WHERE role = 'owner';
    IF existing_owner_count = 0 THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
      UPDATE public.profiles SET is_premium = true WHERE id = NEW.id;
    ELSE
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
    END IF;
  END IF;

  RETURN NEW;
END; $function$;