-- 023: categorias de gestion de correos
--
-- `correo_mensajes.categoria_gestion` es LOCAL: la asigna el asesor desde la
-- bandeja y la sincronizacion con Microsoft Graph no la pisa (a diferencia de
-- `categorias`, que guarda las etiquetas de Outlook y se sobrescribe en cada
-- delta). `correo_categorias` es el catalogo compartido que los asesores pueden
-- ampliar (POST /correos/categorias-gestion).
--
-- Aplicar manualmente con psql en produccion (el ORM corre con synchronize:false).

ALTER TABLE correo_mensajes
  ADD COLUMN IF NOT EXISTS categoria_gestion varchar(120);

CREATE INDEX IF NOT EXISTS idx_correo_mensajes_categoria_gestion
  ON correo_mensajes (categoria_gestion);

CREATE TABLE IF NOT EXISTS correo_categorias (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre varchar(120) NOT NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_correo_categorias_nombre
  ON correo_categorias (lower(nombre));

-- Semilla: ejemplos tipicos de gestion. ON CONFLICT DO NOTHING cubre tanto la
-- restriccion del indice unico como re-ejecuciones de la migracion.
INSERT INTO correo_categorias (nombre) VALUES
  ('Requerimiento'),
  ('Error'),
  ('Solicitud'),
  ('Cambios')
ON CONFLICT DO NOTHING;
