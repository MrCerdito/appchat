-- 010: eventos de sesión para el historial en vivo
-- Registra solicitud de asesor, clics en preguntas frecuentes y otros hitos,
-- además de persistir los documentos que la IA entrega en cada respuesta.

CREATE TABLE IF NOT EXISTS session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tipo varchar(50) NOT NULL,
  detalle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_events_session
  ON session_events(session_id, created_at);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS documentos jsonb;
