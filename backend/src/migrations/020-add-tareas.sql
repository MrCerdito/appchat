-- ═══════════════════════════════════════════════════════════════════════════
-- 020 · Tareas internas de desarrolladores
--
-- Workspace interno de trabajo. Una tarea puede:
--   · Ser independiente (tarea interna).
--   · Colgar de un ticket (parent_task_id IS NULL, ticket_id NO NULL).
--   · Tener subtareas anidadas SIN limite de profundidad (parent_task_id).
--
-- Decisiones de diseno relevantes:
--   · NO se desnormalizan contadores de subtareas. Con anidamiento arbitrario
--     habria que reescribir la cadena de ancestros en cada cambio de estado y
--     es una fuente clasica de datos desincronizados. El servicio arma el arbol
--     en memoria desde una sola consulta.
--   · El borrado de una tarea arrastra su subarbol completo por ON DELETE
--     CASCADE. El endpoint DELETE calcula cuantos nietos se van con ella para
--     poder avisarlo en el dialogo de confirmacion.
--   · order_index ordena entre hermanos. El arrastre del kanban lo persiste.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───── tasks ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                varchar(20)  NOT NULL UNIQUE,
  titulo                varchar(255) NOT NULL,
  descripcion           text,

  status                varchar(20)  NOT NULL DEFAULT 'pendiente',
  prioridad             varchar(20)  NOT NULL DEFAULT 'medium',

  -- Subarbol: NULL = tarea raiz. Auto-Referencia en cascada.
  parent_task_id        uuid         REFERENCES tasks(id) ON DELETE CASCADE,

  -- Vinculo opcional con un ticket. Si el ticket se borra, sus tareas tambien.
  ticket_id             uuid         REFERENCES tickets(id) ON DELETE CASCADE,

  -- Modulo/equipo de desarrollo (tabla `modulos`, ya existente).
  modulo_id             uuid         REFERENCES modulos(id) ON DELETE SET NULL,

  -- Autoria. SET NULL para que el historico sobreviva a la baja del usuario.
  created_by_id         uuid         REFERENCES users(id) ON DELETE SET NULL,
  created_by_name       varchar(255),

  -- Etiquetas libres. jsonb por consistencia con notes/conversation/clientInfo.
  tags                  jsonb        NOT NULL DEFAULT '[]'::jsonb,

  -- Planificacion y recordatorios.
  due_date              timestamptz,
  reminder_sent_at      timestamptz,

  -- Ciclo de vida de la ejecucion.
  started_at            timestamptz,
  completed_at          timestamptz,
  completed_by_id       uuid         REFERENCES users(id) ON DELETE SET NULL,

  -- Total de horas registradas, desnormalizado para no sumar el historico en
  -- cada listado. task_time_entries es la fuente de verdad.
  time_spent_minutes    int          NOT NULL DEFAULT 0,

  -- Orden manual dentro de la columna o del padre (siblings).
  order_index           double precision NOT NULL DEFAULT 0,

  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_prioridad   ON tasks(prioridad);
CREATE INDEX IF NOT EXISTS idx_tasks_parent      ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ticket      ON tasks(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tasks_modulo      ON tasks(modulo_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due         ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by  ON tasks(created_by_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created     ON tasks(created_at DESC);

-- El indice parcial del kanban es el caso de uso caliente: solo raices.
CREATE INDEX IF NOT EXISTS idx_tasks_raiz
  ON tasks(status, order_index) WHERE parent_task_id IS NULL;

-- ───── task_assignees ────────────────────────────────────────────────────
-- Varios responsables por tarea (N:M). Se eligio una tabla puente y no un
-- array de ids en jsonb porque hace falta filtrar e indexar por persona:
-- "mis tareas" es la consulta mas frecuente del workspace.
CREATE TABLE IF NOT EXISTS task_assignees (
  tarea_id        uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  asignado_por_id uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tarea_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);

-- ───── task_comments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id     uuid         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id    uuid         REFERENCES users(id) ON DELETE SET NULL,
  author_name  varchar(255),
  contenido    text         NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_tarea ON task_comments(tarea_id, created_at);

-- ───── task_time_entries ─────────────────────────────────────────────────
-- Registro de horas. Es la fuente de verdad; tasks.time_spent_minutes es un
-- acumulado que esta tabla alimenta.
CREATE TABLE IF NOT EXISTS task_time_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id   uuid         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    uuid         REFERENCES users(id) ON DELETE SET NULL,
  user_name  varchar(255),
  minutos    int          NOT NULL,
  nota       varchar(300),
  logged_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_time_tarea ON task_time_entries(tarea_id);
CREATE INDEX IF NOT EXISTS idx_task_time_user  ON task_time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logged ON task_time_entries(logged_at DESC);
