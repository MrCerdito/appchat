-- Columba updated_by en comunicado_templates y bitacora de cambios.
--
-- Contexto: el commit 851f0d1 ("correos de prueba globales y bitacora de envios")
-- declaro `updatedBy` en ComunicadoTemplate y creo la entity ComunicadoTemplateLog,
-- pero solo agrego la migracion 019 (configuracion.comunicado_test_emails).
-- En produccion corre con synchronize:false (ver app.module.ts:204) y no hay runner
-- de migraciones, por lo que el esquema nunca se alineo con las entities y
-- GET/POST/PUT/DELETE /comunicados/templates devolvian 500 con
-- "column t.updated_by does not exist".
--
-- Todo el DDL es aditivo e idempotente: no altera ni elimina datos existentes.
-- No ejecutar `synchronize` para "arreglar" esto: el diff de TypeORM tambien pide
-- DROP de documentos.embedding_vec (tipo vector de pgvector que no reconoce) y de
-- widget_config.chat_avatar, lo cual destruiria datos reales.

-- 1) Columna declarada en la entity (comunicado-template.entity.ts:35-37) que faltaba.
--    Nullable: las filas existentes quedan con updated_by = NULL, que es la semantica
--    correcta ("nunca fue editada"). Metadatos only, no reescribe la tabla.
ALTER TABLE comunicado_templates
  ADD COLUMN IF NOT EXISTS updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL;

-- 2) Bitacora de plantillas (comunicado-template-log.entity.ts:29): tabla inexistente.
--    El servicio ya escribia aqui (comunicados.service.ts:1188) pero el error se
--    tragaba en un catch, por lo que GET /comunicados/templates/:id/logs daba 500
--    sin dejar rastro visible.
CREATE TABLE IF NOT EXISTS comunicado_template_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id uuid NULL REFERENCES comunicado_templates(id) ON DELETE SET NULL,
  template_name varchar(150) NULL,
  usuario_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  accion varchar(50) NOT NULL,
  cambios jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_template_logs_template_id
  ON comunicado_template_logs (template_id);

CREATE INDEX IF NOT EXISTS idx_template_logs_created_at
  ON comunicado_template_logs (created_at);