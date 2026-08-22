-- ================================================================
-- ESQUEMA COMPLETO para ANOTHERFACE (UNITEC)
-- Ejecuta TODO este bloque en:
--   supabase.com → tu proyecto → SQL Editor → New query → Run
-- ================================================================

-- 1. Eliminar tabla anterior si existe
drop table if exists public.sesiones_demo;

-- 2. Crear tabla completa con TODOS los campos
create table public.sesiones_demo (
  id                  uuid        primary key default gen_random_uuid(),
  session_id          uuid        not null,
  evento              text        not null,
  usuario             text,
  contrasena          text,
  filtro              text,
  con_imagen          boolean     default false,
  imagen_base64       text,
  imagen_url          text,        -- URL pública en Supabase Storage (si se subió)
  con_landmarks       boolean     default false,
  landmarks_faciales  jsonb,
  navegador           text,
  idioma              text,
  zona_horaria        text,
  resolucion_pantalla text,
  creado_en           timestamptz not null default now()
);

-- 3. Row Level Security
alter table public.sesiones_demo enable row level security;

-- 4. Política INSERT para anon
drop policy if exists "insertar_desde_demo" on public.sesiones_demo;
create policy "insertar_desde_demo"
  on public.sesiones_demo
  for insert
  to anon
  with check (true);

-- ================================================================
-- STORAGE — Para guardar las capturas como archivos reales
-- Haz esto MANUALMENTE en el dashboard de Supabase:
--
--  1. Ve a Storage (menú izquierdo)
--  2. Clic en "New bucket"
--  3. Nombre del bucket:  capturas
--  4. Activa "Public bucket" (para que las URLs sean accesibles)
--  5. Clic en "Create bucket"
--
-- Luego pega y ejecuta el bloque de abajo para dar permisos de
-- subida a usuarios anónimos (el frontend con la anon key):
-- ================================================================

-- Permisos de Storage para el bucket "capturas"
-- (solo necesitas esto si Supabase no lo configura automáticamente)
create policy "upload_capturas_anon"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'capturas');

create policy "read_capturas_public"
  on storage.objects
  for select
  to public
  using (bucket_id = 'capturas');
