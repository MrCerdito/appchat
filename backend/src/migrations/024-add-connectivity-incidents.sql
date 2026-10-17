-- 024: revisiones de incidentes de conectividad + índices de consulta
--
-- `connectivity_incidents` guarda SOLO la revisión humana (estado de revisión,
-- comentario, responsable) de incidentes que se detectan on-read desde
-- `advisor_activity_log`. La detección no se persiste: si no hay fila aquí, el
-- incidente se muestra como "nuevo".
--
-- Aplicar manualmente con psql en produccion (el ORM corre con synchronize:false).
-- En desarrollo la crea synchronize al arrancar.

CREATE TABLE IF NOT EXISTS connectivity_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ojo: la entidad TypeORM NO usa naming strategy, las columnas se llaman
  -- tal cual el atributo (camelCase). Crearlas snake_case rompe el SELECT
  -- con "column userId does not exist".
  "userId" uuid NOT NULL,
  clave varchar(80) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'nuevo',
  comentario text,
  "responsableId" uuid NULL,
  "creadoEn" timestamptz NOT NULL DEFAULT now(),
  "actualizadoEn" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_connectivity_incidents_user_clave UNIQUE ("userId", clave)
);

CREATE INDEX IF NOT EXISTS idx_connectivity_incidents_estado
  ON connectivity_incidents (estado);

-- Índices de lectura del historial: las métricas y el mapa de calor filtran
-- por tipo='desconexion' dentro de un rango de fechas.
CREATE INDEX IF NOT EXISTS idx_advisor_activity_tipo_desde
  ON advisor_activity_log (tipo, desde);

CREATE INDEX IF NOT EXISTS idx_advisor_activity_fecha
  ON advisor_activity_log (fecha);
