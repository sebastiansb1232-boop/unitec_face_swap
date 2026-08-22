-- ================================================================
-- ESQUEMA COMPLETO para ANOTHERFACE (UNITEC)
-- Ejecuta TODO este bloque en:
--   supabase.com → tu proyecto → SQL Editor → New query → Run
-- ================================================================

-- 1. Eliminar tabla anterior si existe (para empezar limpio)
drop table if exists public.sesiones_demo;

-- 2. Crear tabla completa con TODOS los campos que usa el frontend
create table public.sesiones_demo (
  id                  uuid        primary key default gen_random_uuid(),
  session_id          uuid        not null,
  evento              text        not null,
  usuario             text,                    -- usuario del login falso (demo de concientización)
  contrasena          text,                    -- contraseña del login falso (demo de concientización)
  filtro              text,
  con_imagen          boolean     default false,
  imagen_base64       text,
  con_landmarks       boolean     default false,
  landmarks_faciales  jsonb,
  navegador           text,
  idioma              text,
  zona_horaria        text,
  resolucion_pantalla text,
  creado_en           timestamptz not null default now()
);

-- 3. Activar Row Level Security
alter table public.sesiones_demo enable row level security;

-- 4. Política: cualquiera con la anon key puede INSERTAR (el frontend)
drop policy if exists "insertar_desde_demo" on public.sesiones_demo;
create policy "insertar_desde_demo"
  on public.sesiones_demo
  for insert
  to anon
  with check (true);

-- 5. Nadie con la anon key puede LEER los datos (solo tú desde el dashboard)
-- (No hay política SELECT para anon → denegado por defecto con RLS activo)

-- ¡Listo! Después de correr esto, ve a Table Editor → sesiones_demo
-- y deberías ver la tabla vacía, lista para recibir datos.
