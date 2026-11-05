-- Anotherface: migración aditiva. No elimina la tabla ni fotos anteriores.
-- Ejecutar UNA VEZ antes de desplegar esta versión.
begin;
create table if not exists public.sesiones_demo (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null,
 evento text not null,
 usuario text,
 contrasena text,
 filtro text,
 con_imagen boolean default false,
 imagen_base64 text,
 imagen_url text,
 con_landmarks boolean default false,
 landmarks_faciales jsonb,
 navegador text,
 idioma text,
 zona_horaria text,
 resolucion_pantalla text,
 creado_en timestamptz not null default now()
);
alter table public.sesiones_demo add column if not exists imagen_base64 text;
alter table public.sesiones_demo add column if not exists imagen_url text;
alter table public.sesiones_demo add column if not exists con_imagen boolean default false;
alter table public.sesiones_demo add column if not exists con_landmarks boolean default false;
alter table public.sesiones_demo add column if not exists landmarks_faciales jsonb;
create index if not exists sesiones_demo_capturas_fecha on public.sesiones_demo (creado_en desc,id desc) where evento='captura' and con_imagen=true;
alter table public.sesiones_demo enable row level security;
-- El navegador ya no escribe ni lee Supabase: solo el backend autenticado.
revoke all on table public.sesiones_demo from anon, authenticated;
grant select, insert, delete on table public.sesiones_demo to service_role;
drop policy if exists "insertar_desde_demo" on public.sesiones_demo;
drop policy if exists "upload_capturas_anon" on storage.objects;
drop policy if exists "read_capturas_public" on storage.objects;
-- Protege también fotos históricas. El backend crea enlaces firmados de 5 minutos.
update storage.buckets set public=false where id='capturas';
commit;
-- Los datos históricos (incluidas contraseñas que recogía la demo) NO se borran.
-- Revisar y eliminar esos datos por separado, con autorización y copia segura.
-- Las nuevas capturas no almacenan usuarios, contraseñas ni eventos de uso.
