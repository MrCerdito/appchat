-- Notas de actualización (changelog) publicadas por el superadmin.
-- El modal de novedades se muestra 1 sola vez por usuario/actualización
-- gracias a la tabla changelog_seen.

CREATE TABLE IF NOT EXISTS changelogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo varchar(300) NOT NULL,
  categoria varchar(40) NOT NULL DEFAULT 'mejora',
  version varchar(50) NULL,
  cuerpo text NOT NULL,
  design jsonb NULL,
  publicado boolean NOT NULL DEFAULT false,
  publicado_el timestamptz NULL,
  creado_por uuid NULL REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelogs_publicado
  ON changelogs (publicado, publicado_el DESC);

CREATE TABLE IF NOT EXISTS changelog_seen (
  changelog_id uuid NOT NULL REFERENCES changelogs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (changelog_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_changelog_seen_user
  ON changelog_seen (user_id);