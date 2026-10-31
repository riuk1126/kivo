-- Kivo 1.0.6 · Escritor, Estudiante y Curso corto
-- Guarda el horario, las metas, las fichas y el historial de sesiones de cada espacio.
-- Pégalo en Supabase → SQL Editor → Run (se puede correr varias veces sin problema).
alter table public.lists add column if not exists meta jsonb default '{}'::jsonb;
