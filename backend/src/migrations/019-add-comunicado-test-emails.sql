-- Correos de prueba de Comunicados, guardados de forma GLOBAL (compartidos
-- por todos los asesores/usuarios). Se ejecuta en producción donde
-- synchronize=false.

ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS comunicado_test_emails jsonb NOT NULL DEFAULT '[]';