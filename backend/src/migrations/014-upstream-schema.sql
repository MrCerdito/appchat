-- 014-upstream-schema.sql
-- Esquema requerido por el commit upstream 467c8da (estado asesores, historial xlsx,
-- tickets/SLA, notificaciones, módulos). Se ejecuta en producción con synchronize=false.
-- Ejecutar: psql -U postgres -d app -f 014-upstream-schema.sql

-- ───── Session: tratamiento_datos_at ───────────────────────────────────────
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tratamiento_datos_at timestamptz;

-- ───── Configuracion: SLA de tickets ───────────────────────────────────────
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS ticket_sla_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ticket_sla_hours jsonb NOT NULL DEFAULT '{"low":168,"medium":72,"high":24,"critical":8}'::jsonb;

-- ───── Tickets: institucion, canal, SLA, pausa, notas ──────────────────────
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS institucion varchar(255),
  ADD COLUMN IF NOT EXISTS canal varchar(20) NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS sla_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS sla_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_paused_ms int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes jsonb;

-- ───── Notifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         varchar(50)  NOT NULL,
  title        varchar(255) NOT NULL,
  message      text         NOT NULL,
  entity_type  varchar(50)  NOT NULL DEFAULT 'ticket',
  entity_id    varchar(36)  NOT NULL,
  entity_codigo varchar(20),
  recipient_id uuid         NOT NULL,
  sender_id    uuid,
  read         boolean      NOT NULL DEFAULT false,
  read_at      timestamptz,
  meta         jsonb,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_notifications_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON notifications(recipient_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- ───── User notification preferences ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL UNIQUE,
  prefs      jsonb NOT NULL DEFAULT '{"ticket_created":{"inApp":true,"desktop":true},"ticket_assigned":{"inApp":true,"desktop":true},"ticket_reassigned":{"inApp":true,"desktop":true},"ticket_updated":{"inApp":true,"desktop":true},"ticket_status_changed":{"inApp":true,"desktop":true},"ticket_priority_changed":{"inApp":true,"desktop":false},"ticket_closed":{"inApp":true,"desktop":true},"ticket_denied":{"inApp":true,"desktop":true},"ticket_deleted":{"inApp":true,"desktop":false},"ticket_sla_warning":{"inApp":true,"desktop":true},"ticket_sla_expired":{"inApp":true,"desktop":true}}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_notif_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ───── Modulos + desarrolladores ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modulos (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      varchar(100) NOT NULL UNIQUE,
  descripcion varchar(500),
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS modulo_desarrolladores (
  modulo_id uuid NOT NULL,
  user_id   uuid NOT NULL,
  PRIMARY KEY (modulo_id, user_id),
  CONSTRAINT fk_modulo_dev_modulo FOREIGN KEY (modulo_id) REFERENCES modulos(id) ON DELETE CASCADE,
  CONSTRAINT fk_modulo_dev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);