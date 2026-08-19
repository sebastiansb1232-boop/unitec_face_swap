-- Ejecuta esto en el SQL Editor de tu proyecto de Supabase
-- (supabase.com/dashboard -> tu proyecto -> SQL Editor -> New query)

create table if not exists public.sesiones_demo (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  evento text not null,               -- 'camara_activada' | 'captura' | 'camara_apagada'
  filtro text,
  con_imagen boolean default false,
  imagen_base64 text,                 -- null si el usuario no dio consentimiento de imagen
  navegador text,
  idioma text,
  zona_horaria text,
  resolucion_pantalla text,
  creado_en timestamptz not null default now()
);

-- Row Level Security: obliga a pasar por políticas explícitas,
-- en vez de dejar la tabla abierta a cualquier lectura/escritura.
alter table public.sesiones_demo enable row level security;

-- Permitir que la app inserte registros (rol "anon" = anon key del frontend)
create policy "insertar_desde_demo"
  on public.sesiones_demo
  for insert
  to anon
  with check (true);

-- NO se crea política de SELECT para "anon": así nadie puede leer
-- los registros de otras personas usando la anon key del navegador.
-- Para revisar los datos del proyecto, usa el Table Editor de Supabase
-- (con tu cuenta) o el service_role key desde un entorno seguro.

-- Sugerido: borra los datos de la demo cuando termine el curso.
-- delete from public.sesiones_demo where creado_en < now() - interval '30 days';
