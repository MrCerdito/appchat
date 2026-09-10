-- Campos booleanos (SI/NO) del perfil institucional que se muestran
-- como filtro en el módulo de comunicados.
ALTER TABLE pi_campos
  ADD COLUMN IF NOT EXISTS filtro_comunicados boolean NOT NULL DEFAULT false;