-- ============================================================
--  PENDIENTES · Base de datos para trabajar en equipo
--  Cómo usarlo: Supabase → SQL Editor → New query →
--  pega TODO este archivo → botón "Run".
--  Se puede ejecutar más de una vez sin problema.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tablas ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text,
  color      text default '#e8590c',
  created_at timestamptz default now()
);

create table if not exists public.lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Lista',
  emoji      text default '📁',
  color      text default '#e8590c',
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.list_members (
  list_id    uuid not null references public.lists(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text default 'member',
  created_at timestamptz default now(),
  primary key (list_id, user_id)
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid references public.lists(id) on delete set null,
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  assignee    uuid references auth.users(id) on delete set null,
  text        text not null default '',
  emoji       text default '',
  date        date,
  time        text,
  remind      text default '10',
  repeat      text default '',
  star        boolean default false,
  status      text default 'todo',
  progress    int default 0,
  subtasks    jsonb default '[]'::jsonb,
  notes       text default '',
  done_note   text default '',
  mood        text default '',
  done_at     bigint,
  done_on     date,
  done_by     uuid references auth.users(id) on delete set null,
  at          bigint,
  ord         double precision,
  contact     jsonb,
  attach      jsonb default '[]'::jsonb,
  spawned     boolean default false,
  updated_by  uuid,
  updated_dev text,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now()
);
create index if not exists tasks_list_idx  on public.tasks(list_id);
create index if not exists tasks_owner_idx on public.tasks(owner);

create table if not exists public.activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null,
  body       text default '',
  task_text  text default '',
  dev        text,
  created_at timestamptz default now()
);
create index if not exists activity_task_idx on public.activity(task_id, created_at desc);

-- ---------- Funciones de ayuda (seguridad) ----------
create or replace function public.is_list_member(lid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.list_members where list_id = lid and user_id = auth.uid());
$$;

create or replace function public.can_access_task(tid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.tasks t
    where t.id = tid
      and (t.owner = auth.uid() or (t.list_id is not null and public.is_list_member(t.list_id)))
  );
$$;

create or replace function public.shares_list_with(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.list_members a
    join public.list_members b on a.list_id = b.list_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- Perfil automático al crear una cuenta
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email),
          coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles para cuentas que ya existían
insert into public.profiles (id, email, name)
select id, lower(email), split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- El dueño de una lista queda como miembro
create or replace function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.list_members (list_id, user_id, role)
  values (new.id, new.owner, 'owner') on conflict do nothing;
  return new;
end $$;
drop trigger if exists lists_add_owner on public.lists;
create trigger lists_add_owner after insert on public.lists
  for each row execute function public.add_owner_member();

-- Fecha de última edición
create or replace function public.touch_updated() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated();

-- Invitar a alguien (por correo) a una lista
create or replace function public.invite_to_list(p_list uuid, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.is_list_member(p_list) then return 'forbidden'; end if;
  select id into v_user from public.profiles where email = lower(trim(p_email)) limit 1;
  if v_user is null then return 'not_found'; end if;
  if exists (select 1 from public.list_members where list_id = p_list and user_id = v_user) then
    return 'already';
  end if;
  insert into public.list_members (list_id, user_id, role) values (p_list, v_user, 'member');
  return 'ok';
end $$;

-- ---------- Permisos ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles, public.lists, public.list_members, public.tasks, public.activity to authenticated;
grant execute on function public.is_list_member(uuid), public.can_access_task(uuid),
  public.shares_list_with(uuid), public.invite_to_list(uuid, text) to authenticated;

alter table public.profiles     enable row level security;
alter table public.lists        enable row level security;
alter table public.list_members enable row level security;
alter table public.tasks        enable row level security;
alter table public.activity     enable row level security;

-- Perfiles: me veo a mí y a quienes comparten una lista conmigo
drop policy if exists "perfil ver"    on public.profiles;
drop policy if exists "perfil editar" on public.profiles;
create policy "perfil ver" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_list_with(id));
create policy "perfil editar" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Listas
drop policy if exists "listas ver"    on public.lists;
drop policy if exists "listas crear"  on public.lists;
drop policy if exists "listas editar" on public.lists;
drop policy if exists "listas borrar" on public.lists;
create policy "listas ver" on public.lists for select to authenticated
  using (owner = auth.uid() or public.is_list_member(id));
create policy "listas crear" on public.lists for insert to authenticated
  with check (owner = auth.uid());
create policy "listas editar" on public.lists for update to authenticated
  using (public.is_list_member(id)) with check (public.is_list_member(id));
create policy "listas borrar" on public.lists for delete to authenticated
  using (owner = auth.uid());

-- Miembros (las invitaciones se hacen con invite_to_list)
drop policy if exists "miembros ver"    on public.list_members;
drop policy if exists "miembros quitar" on public.list_members;
create policy "miembros ver" on public.list_members for select to authenticated
  using (public.is_list_member(list_id));
create policy "miembros quitar" on public.list_members for delete to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.lists l where l.id = list_id and l.owner = auth.uid()));

-- Tareas: las mías o las de una lista donde estoy
drop policy if exists "tareas ver"    on public.tasks;
drop policy if exists "tareas crear"  on public.tasks;
drop policy if exists "tareas editar" on public.tasks;
drop policy if exists "tareas borrar" on public.tasks;
create policy "tareas ver" on public.tasks for select to authenticated
  using (owner = auth.uid() or (list_id is not null and public.is_list_member(list_id)));
create policy "tareas crear" on public.tasks for insert to authenticated
  with check ((list_id is null and owner = auth.uid())
              or (list_id is not null and public.is_list_member(list_id)));
create policy "tareas editar" on public.tasks for update to authenticated
  using (owner = auth.uid() or (list_id is not null and public.is_list_member(list_id)))
  with check (owner = auth.uid() or (list_id is not null and public.is_list_member(list_id)));
create policy "tareas borrar" on public.tasks for delete to authenticated
  using (owner = auth.uid() or (list_id is not null and public.is_list_member(list_id)));

-- Actividad y comentarios
drop policy if exists "actividad ver"   on public.activity;
drop policy if exists "actividad crear" on public.activity;
create policy "actividad ver" on public.activity for select to authenticated
  using (public.can_access_task(task_id));
create policy "actividad crear" on public.activity for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_task(task_id));

-- ---------- Tiempo real ----------
do $$
declare t text;
begin
  foreach t in array array['tasks', 'lists', 'list_members', 'activity'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- Fotos y archivos ----------
insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;

drop policy if exists "adjuntos ver"    on storage.objects;
drop policy if exists "adjuntos subir"  on storage.objects;
drop policy if exists "adjuntos borrar" on storage.objects;
create policy "adjuntos ver" on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and public.can_access_task(((storage.foldername(name))[1])::uuid));
create policy "adjuntos subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and public.can_access_task(((storage.foldername(name))[1])::uuid));
create policy "adjuntos borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'adjuntos' and public.can_access_task(((storage.foldername(name))[1])::uuid));

-- ¡Listo! 🎉
