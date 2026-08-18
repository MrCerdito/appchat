-- Plantillas reutilizables de comunicados (contenido del correo, sin destinatarios).
CREATE TABLE IF NOT EXISTS comunicado_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(150) NOT NULL,
  asunto varchar(300) NOT NULL,
  cuerpo text NOT NULL,
  design jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comunicado_templates_created_by
  ON comunicado_templates (created_by);
