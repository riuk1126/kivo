-- Kivo 1.4 · Reacciones en el chat (👍 ❤️ 😂 ✅ 😮)
-- Pégalo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.

create table if not exists public.chat_reacts (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.chat_reacts enable row level security;

create or replace function public.can_see_message(mid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.chat_messages m where m.id = mid and public.is_list_member(m.list_id));
$$;

drop policy if exists "reacciones ver"    on public.chat_reacts;
drop policy if exists "reacciones poner"  on public.chat_reacts;
drop policy if exists "reacciones cambiar" on public.chat_reacts;
drop policy if exists "reacciones quitar" on public.chat_reacts;
create policy "reacciones ver" on public.chat_reacts for select to authenticated using (public.can_see_message(message_id));
create policy "reacciones poner" on public.chat_reacts for insert to authenticated with check (user_id = auth.uid() and public.can_see_message(message_id));
create policy "reacciones cambiar" on public.chat_reacts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reacciones quitar" on public.chat_reacts for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.chat_reacts to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.chat_reacts; exception when others then null; end;
end $$;
