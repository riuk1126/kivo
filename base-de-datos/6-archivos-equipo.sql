-- Kivo 1.0.21 · Archivos del equipo (portafolio, brochure, PDFs…)
-- Pégalo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
-- Crea un espacio de archivos privado: solo lo ven los miembros del espacio de Arquizo.

insert into storage.buckets (id, name, public, file_size_limit)
values ('equipo', 'equipo', false, 52428800)
on conflict (id) do update set file_size_limit = 52428800;

drop policy if exists "equipo ver"    on storage.objects;
drop policy if exists "equipo subir"  on storage.objects;
drop policy if exists "equipo borrar" on storage.objects;
create policy "equipo ver" on storage.objects for select to authenticated
  using (bucket_id = 'equipo' and public.is_list_member(((storage.foldername(name))[1])::uuid));
create policy "equipo subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'equipo' and public.is_list_member(((storage.foldername(name))[1])::uuid));
create policy "equipo borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'equipo' and public.is_list_member(((storage.foldername(name))[1])::uuid));
