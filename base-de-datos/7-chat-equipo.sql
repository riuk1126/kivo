-- Kivo 1.3 · Chat del equipo en tiempo real (un chat por cada lista compartida, por ejemplo Arquizo)
-- Pégalo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null default '',
  attach jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_list_time on public.chat_messages (list_id, created_at desc);

create table if not exists public.chat_reads (
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  last_read timestamptz not null default now(),
  primary key (list_id, user_id)
);

alter table public.chat_messages enable row level security;
alter table public.chat_reads    enable row level security;

drop policy if exists "chat ver"     on public.chat_messages;
drop policy if exists "chat escribir" on public.chat_messages;
drop policy if exists "chat editar"  on public.chat_messages;
create policy "chat ver" on public.chat_messages for select to authenticated
  using (public.is_list_member(list_id));
create policy "chat escribir" on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_list_member(list_id));
create policy "chat editar" on public.chat_messages for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "leidos propios" on public.chat_reads;
create policy "leidos propios" on public.chat_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_list_member(list_id));

grant select, insert, update on public.chat_messages to authenticated;
grant select, insert, update on public.chat_reads to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.chat_messages; exception when others then null; end;
end $$;
