-- Kivo 1.3.1 · Foto de perfil (se ve en el chat y en tu equipo)
-- Pégalo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
alter table public.profiles add column if not exists avatar text;
do $$ begin
  begin alter publication supabase_realtime add table public.profiles; exception when others then null; end;
end $$;
