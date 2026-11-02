-- ============================================================
--  KIVO · Cotizador Arquizo (solo para el equipo de Arquizo)
--  Supabase → SQL Editor → pega todo → Run. Se puede correr varias veces.
--  Las cotizaciones y los ajustes se comparten entre los miembros del
--  espacio «Arquizo» (las personas con quienes lo compartes en Kivo).
-- ============================================================

create table if not exists public.cotizaciones (
  id          text primary key,
  team        uuid not null references public.lists(id) on delete cascade,
  data        jsonb not null,
  actualizado bigint,
  updated_by  uuid,
  updated_at  timestamptz default now()
);
create index if not exists cotizaciones_team_idx on public.cotizaciones(team, actualizado desc);

create table if not exists public.cot_config (
  team       uuid not null references public.lists(id) on delete cascade,
  key        text not null,
  data       jsonb,
  updated_at timestamptz default now(),
  primary key (team, key)
);

alter table public.cotizaciones enable row level security;
alter table public.cot_config  enable row level security;

drop policy if exists "cot ver"    on public.cotizaciones;
drop policy if exists "cot crear"  on public.cotizaciones;
drop policy if exists "cot editar" on public.cotizaciones;
drop policy if exists "cot borrar" on public.cotizaciones;
create policy "cot ver"    on public.cotizaciones for select to authenticated using (public.is_list_member(team));
create policy "cot crear"  on public.cotizaciones for insert to authenticated with check (public.is_list_member(team));
create policy "cot editar" on public.cotizaciones for update to authenticated using (public.is_list_member(team)) with check (public.is_list_member(team));
create policy "cot borrar" on public.cotizaciones for delete to authenticated using (public.is_list_member(team));

drop policy if exists "cotcfg ver"    on public.cot_config;
drop policy if exists "cotcfg crear"  on public.cot_config;
drop policy if exists "cotcfg editar" on public.cot_config;
create policy "cotcfg ver"    on public.cot_config for select to authenticated using (public.is_list_member(team));
create policy "cotcfg crear"  on public.cot_config for insert to authenticated with check (public.is_list_member(team));
create policy "cotcfg editar" on public.cot_config for update to authenticated using (public.is_list_member(team)) with check (public.is_list_member(team));

grant select, insert, update, delete on public.cotizaciones to authenticated;
grant select, insert, update on public.cot_config to authenticated;

-- En vivo: cuando una guarda, la otra lo ve al instante
do $$ begin
  begin alter publication supabase_realtime add table public.cotizaciones; exception when others then null; end;
end $$;

-- ¡Listo!
