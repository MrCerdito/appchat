-- Tablas del modulo de correos (Graph/IMAP) y auditoria de tickets.
--
-- Contexto: el pull del 06/10 (commits 6460d24 y 0ae30ad) agrego 4 entities nuevas
-- -- correo-mensaje, correo-adjunto, correo-carpeta-sync y ticket-audit -- sin
-- accompanying SQL. En produccion corre con synchronize:false (app.module.ts:204) y
-- no hay runner de migraciones, asi que al desplegar el build nuevo el modulo de
-- correos y el de ticketsfallen con relation "..." does not exist.
--
-- Estas tablas estan registradas via TypeOrmModule.forFeature() en sus modulos
-- (correos/correos.module.ts:30, tickets/tickets.module.ts:20), por eso no aparecen
-- en el array `entities` de app.module.ts y el diff de esquema no es la unica forma
-- de detectarlas.
--
-- DDL generado con el propio schema builder de TypeORM (compute-only) y depurado a
-- mano. Todo es aditivo e idempotente: solo crea tablas nuevas, vacias.
-- NO ejecutar `synchronize` para esto: el diff tambien pide DROP de
-- documentos.embedding_vec (tipo vector de pgvector que TypeORM no reconoce) y de
-- widget_config.chat_avatar, lo cual destruiria datos reales.

-- ─────────────────────────────────────────────────────────────────────────────
-- correo_mensajes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS correo_mensajes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  graph_message_id varchar(255) NOT NULL,
  folder_id varchar(255) NOT NULL,
  folder_display_name varchar(255),
  asesor_id uuid NOT NULL,
  conversation_id varchar(255),
  subject varchar(500),
  from_nombre varchar(300),
  from_email varchar(300),
  reply_to text,
  para text,
  cc text,
  categorias text,
  body_preview text,
  is_read boolean NOT NULL DEFAULT false,
  has_attachments boolean NOT NULL DEFAULT false,
  importance varchar(20) NOT NULL DEFAULT 'normal',
  internet_message_id varchar(500),
  received_at timestamptz,
  sent_at timestamptz,
  origen varchar(20) NOT NULL DEFAULT 'buzon',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_correo_mensajes_asesor" FOREIGN KEY (asesor_id)
    REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_b665831f060b1a95cffac8989c"
  ON correo_mensajes (graph_message_id);
CREATE INDEX IF NOT EXISTS idx_correo_mensajes_conversation
  ON correo_mensajes (conversation_id);
CREATE INDEX IF NOT EXISTS idx_correo_mensajes_asesor_received
  ON correo_mensajes (asesor_id, received_at);
CREATE INDEX IF NOT EXISTS idx_correo_mensajes_asesor_folder
  ON correo_mensajes (asesor_id, folder_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- correo_adjuntos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS correo_adjuntos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  graph_attachment_id varchar(255) NOT NULL,
  mensaje_id uuid NOT NULL,
  graph_message_id varchar(255) NOT NULL,
  nombre varchar(500),
  content_type varchar(200),
  tamano integer,
  is_inline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_correo_adjuntos_mensaje" FOREIGN KEY (mensaje_id)
    REFERENCES correo_mensajes(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_05c5760dcfa1a7988232a8963c"
  ON correo_adjuntos (graph_attachment_id);
CREATE INDEX IF NOT EXISTS idx_correo_adjuntos_mensaje
  ON correo_adjuntos (mensaje_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- correo_carpeta_sync (delta-link de Graph, una fila por buzon+carpeta)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS correo_carpeta_sync (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  buzon varchar(255) NOT NULL,
  folder_id varchar(255) NOT NULL,
  folder_display_name varchar(255),
  parent_folder_id varchar(255),
  delta_link text,
  importado_completo boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_error varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_correo_carpeta_sync_folder
  ON correo_carpeta_sync (buzon, folder_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ticket_audit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "ticketId" uuid NOT NULL,
  "ticketCodigo" varchar(20) NOT NULL,
  accion varchar(40) NOT NULL,
  campo varchar(60),
  "before" jsonb,
  "after" jsonb,
  "actorId" uuid,
  "actorName" varchar(120),
  "actorRole" varchar(20),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_usuario
  ON ticket_audit ("actorId");
CREATE INDEX IF NOT EXISTS idx_ticket_audit_ticket
  ON ticket_audit ("ticketId", created_at);
