-- KIVO 1.0.5 · Espacios por tipo de trabajo
-- Supabase → SQL Editor → New query → pega esto → Run
alter table public.lists add column if not exists kind text default 'general';
alter table public.tasks add column if not exists stage text;
alter table public.tasks add column if not exists fields jsonb default '{}'::jsonb;
