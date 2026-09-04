-- 013-add-colegio-links.sql
-- Agrega columna links (jsonb) a la tabla colegios para soportar múltiples URLs.
-- Ejecutar: psql -U postgres -d app -f 013-add-colegio-links.sql

ALTER TABLE colegios ADD COLUMN IF NOT EXISTS links jsonb DEFAULT '[]'::jsonb;

-- Migrar datos existentes: copiar link actual al array links
UPDATE colegios
SET links = jsonb_build_array(link)
WHERE link IS NOT NULL
  AND link != ''
  AND (links IS NULL OR links = '[]'::jsonb);
