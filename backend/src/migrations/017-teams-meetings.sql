-- Reuniones de Teams agendadas desde la app (calendario + botón de chat).
-- Las reuniones se crean con una cuenta general (TEAMS_MEETINGS_ACCOUNT)
-- usando el token de aplicación (client_credentials).

CREATE TABLE IF NOT EXISTS teams_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NULL REFERENCES users (id) ON DELETE SET NULL,
  created_by_name varchar(255) NULL,
  subject varchar(255) NOT NULL,
  start_date_time timestamptz NOT NULL,
  end_date_time timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  join_url text NOT NULL,
  meeting_id varchar(255) NULL,
  event_id varchar(255) NULL,
  calendar_target varchar(20) NOT NULL DEFAULT 'shared',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_meetings_start
  ON teams_meetings (start_date_time);

CREATE INDEX IF NOT EXISTS idx_teams_meetings_created_by
  ON teams_meetings (created_by);