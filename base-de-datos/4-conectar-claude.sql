-- ============================================================
--  KIVO · Conectar con Claude
--  Permite que Claude (con tu clave de Kivo) vea y cree cosas en tu Kivo.
--  Supabase → SQL Editor → pega todo → Run. Se puede correr varias veces.
-- ============================================================

-- Claves para conectar Kivo con Claude (se guarda solo su huella, nunca la clave)
create table if not exists public.api_tokens (
  token_hash text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text default 'Claude',
  created_at timestamptz default now(),
  last_used  timestamptz
);
alter table public.api_tokens enable row level security;
drop policy if exists "claves ver"    on public.api_tokens;
drop policy if exists "claves crear"  on public.api_tokens;
drop policy if exists "claves borrar" on public.api_tokens;
create policy "claves ver"    on public.api_tokens for select to authenticated using (user_id = auth.uid());
create policy "claves crear"  on public.api_tokens for insert to authenticated with check (user_id = auth.uid());
create policy "claves borrar" on public.api_tokens for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.api_tokens to authenticated;

-- Por si aún no corriste las actualizaciones anteriores
alter table public.lists add column if not exists kind text default 'general';
alter table public.lists add column if not exists meta jsonb default '{}'::jsonb;
alter table public.tasks add column if not exists stage text;
alter table public.tasks add column if not exists fields jsonb default '{}'::jsonb;

-- ¿De quién es esta clave?
create or replace function public.kivo_api_user(p_key text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; h text := encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
begin
  select user_id into v from public.api_tokens where token_hash = h;
  if v is null then raise exception 'KIVO_CLAVE: la clave de Kivo no es válida o fue borrada'; end if;
  update public.api_tokens set last_used = now() where token_hash = h;
  return v;
end $$;

-- Espacios a los que el usuario tiene acceso
create or replace function public.kivo_api_lists(u uuid) returns setof uuid
language sql security definer stable set search_path = public as $$
  select list_id from public.list_members where user_id = u
  union select id from public.lists where owner = u;
$$;

-- Ver espacios y pendientes
create or replace function public.kivo_api_ver(p_key text, p_hechas boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.kivo_api_user(p_key);
begin
  return jsonb_build_object(
    'usuario', (select name from public.profiles where id = u),
    'espacios', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'nombre', l.name, 'tipo', coalesce(l.kind, 'general'),
        'datos', coalesce(l.meta, '{}'::jsonb) - 'log' - 'cards',
        'compartido', (select count(*) > 1 from public.list_members m where m.list_id = l.id)
      ) order by l.created_at), '[]'::jsonb)
      from public.lists l where l.id in (select public.kivo_api_lists(u))),
    'tareas', (select coalesce(jsonb_agg(x order by x->>'fecha' nulls last, x->>'hora' nulls last), '[]'::jsonb) from (
      select jsonb_strip_nulls(jsonb_build_object(
        'id', t.id, 'texto', t.text, 'espacio_id', t.list_id, 'fecha', t.date, 'hora', nullif(t.time, ''),
        'etapa', t.stage, 'estado', t.status, 'importante', nullif(t.star, false),
        'pasos', nullif(jsonb_array_length(coalesce(t.subtasks, '[]'::jsonb)), 0),
        'campos', nullif(coalesce(t.fields, '{}'::jsonb), '{}'::jsonb))) x
      from public.tasks t
      where (t.list_id in (select public.kivo_api_lists(u)) or (t.list_id is null and t.owner = u))
        and (p_hechas or t.status <> 'done')
      order by t.date nulls last limit 400) s)
  );
end $$;

-- Crear un espacio
create or replace function public.kivo_api_crear_espacio(p_key text, p_nombre text, p_tipo text, p_icono text, p_color text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := public.kivo_api_user(p_key); v uuid := gen_random_uuid();
begin
  insert into public.lists (id, name, emoji, color, owner, kind, meta)
  values (v, left(coalesce(nullif(trim(p_nombre), ''), 'Nuevo espacio'), 40), coalesce(p_icono, 'i:folder'),
          coalesce(p_color, '#2563eb'), u, coalesce(p_tipo, 'general'), coalesce(p_datos, '{}'::jsonb));
  return jsonb_build_object('id', v, 'nombre', left(coalesce(nullif(trim(p_nombre), ''), 'Nuevo espacio'), 40));
end $$;

-- Cambiar un espacio (nombre o datos: horario, cursos, metas…)
create or replace function public.kivo_api_actualizar_espacio(p_key text, p_id uuid, p_nombre text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := public.kivo_api_user(p_key);
begin
  if p_id not in (select public.kivo_api_lists(u)) then raise exception 'KIVO_ACCESO: ese espacio no existe o no es tuyo'; end if;
  update public.lists set
    name = coalesce(left(nullif(trim(p_nombre), ''), 40), name),
    meta = coalesce(meta, '{}'::jsonb) || coalesce(p_datos, '{}'::jsonb)
  where id = p_id;
  return jsonb_build_object('id', p_id, 'ok', true);
end $$;

-- Agregar tareas (una o varias)
create or replace function public.kivo_api_agregar_tareas(p_key text, p_tareas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := public.kivo_api_user(p_key); t jsonb; l uuid; v uuid; out jsonb := '[]'::jsonb; n int := 0;
begin
  for t in select * from jsonb_array_elements(coalesce(p_tareas, '[]'::jsonb)) loop
    l := null;
    if coalesce(t->>'espacio_id', '') <> '' then l := (t->>'espacio_id')::uuid;
    elsif coalesce(t->>'espacio', '') <> '' then
      select id into l from public.lists where id in (select public.kivo_api_lists(u)) and lower(name) = lower(trim(t->>'espacio')) limit 1;
    end if;
    if l is not null and l not in (select public.kivo_api_lists(u)) then raise exception 'KIVO_ACCESO: espacio % no es tuyo', l; end if;
    v := gen_random_uuid(); n := n + 1;
    insert into public.tasks (id, list_id, owner, text, date, time, star, status, progress, stage, subtasks, notes, fields,
                              done_at, done_on, done_by, at, ord, updated_by, updated_dev)
    values (v, l, u, left(coalesce(t->>'texto', ''), 300), nullif(t->>'fecha', '')::date, nullif(t->>'hora', ''),
            coalesce((t->>'importante')::boolean, false), coalesce(t->>'estado', 'todo'),
            case when t->>'estado' = 'done' then 100 else 0 end, nullif(t->>'etapa', ''),
            coalesce(t->'pasos', '[]'::jsonb), coalesce(t->>'notas', ''), coalesce(t->'campos', '{}'::jsonb),
            case when t->>'estado' = 'done' then (extract(epoch from now()) * 1000)::bigint end,
            case when t->>'estado' = 'done' then current_date end, case when t->>'estado' = 'done' then u end,
            (extract(epoch from now()) * 1000)::bigint + n, null, u, 'claude');
    out := out || jsonb_build_object('id', v, 'texto', t->>'texto', 'espacio_id', l);
  end loop;
  return out;
end $$;

-- Cambiar una tarea (mover de día, marcar hecha, cambiar etapa…)
create or replace function public.kivo_api_actualizar_tarea(p_key text, p_id uuid, p_cambios jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := public.kivo_api_user(p_key); c jsonb := coalesce(p_cambios, '{}'::jsonb);
begin
  if not exists (select 1 from public.tasks t where t.id = p_id
                 and (t.list_id in (select public.kivo_api_lists(u)) or (t.list_id is null and t.owner = u))) then
    raise exception 'KIVO_ACCESO: esa tarea no existe o no es tuya';
  end if;
  update public.tasks set
    text   = case when c ? 'texto' then left(c->>'texto', 300) else text end,
    date   = case when c ? 'fecha' then nullif(c->>'fecha', '')::date else date end,
    time   = case when c ? 'hora' then nullif(c->>'hora', '') else time end,
    stage  = case when c ? 'etapa' then nullif(c->>'etapa', '') else stage end,
    star   = case when c ? 'importante' then (c->>'importante')::boolean else star end,
    notes  = case when c ? 'notas' then c->>'notas' else notes end,
    status = case when c ? 'estado' then c->>'estado' else status end,
    progress = case when c->>'estado' = 'done' then 100 when c ? 'estado' and progress = 100 then 0 else progress end,
    done_at = case when c->>'estado' = 'done' then (extract(epoch from now()) * 1000)::bigint when c ? 'estado' then null else done_at end,
    done_on = case when c->>'estado' = 'done' then coalesce(nullif(c->>'hoy', '')::date, current_date) when c ? 'estado' then null else done_on end,
    done_by = case when c->>'estado' = 'done' then u when c ? 'estado' then null else done_by end,
    updated_by = u,
    updated_dev = 'claude'
  where id = p_id;
  return jsonb_build_object('id', p_id, 'ok', true);
end $$;

grant execute on function public.kivo_api_ver(text, boolean) to anon, authenticated;
grant execute on function public.kivo_api_crear_espacio(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.kivo_api_actualizar_espacio(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.kivo_api_agregar_tareas(text, jsonb) to anon, authenticated;
grant execute on function public.kivo_api_actualizar_tarea(text, uuid, jsonb) to anon, authenticated;
revoke execute on function public.kivo_api_lists(uuid) from anon, authenticated, public;
revoke execute on function public.kivo_api_user(text) from anon, authenticated, public;

-- ¡Listo! Ahora Kivo puede conectarse con Claude.
