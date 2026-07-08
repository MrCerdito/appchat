-- Migración: Cambiar tipos de columnas para soportar cifrado AES-256-GCM
-- Los valores cifrados son más largos que el texto plano, por lo que
-- se requiere aumentar la capacidad de las columnas afectadas.

-- ============================================================
-- 1. Session: columnas de datos personales a text
-- ============================================================
ALTER TABLE sessions
  ALTER COLUMN client_name TYPE text,
  ALTER COLUMN identificacion TYPE text,
  ALTER COLUMN apellido TYPE text;

-- ============================================================
-- 2. Message: sender_name a text (el contenido ya era text)
-- ============================================================
ALTER TABLE messages
  ALTER COLUMN sender_name TYPE text;

-- ============================================================
-- NOTA: Los datos existentes se mantienen en texto plano hasta
-- que se actualicen. El ValueTransformer de TypeORM maneja
-- ambos formatos (plaintext legacy y ciphertext nuevo).
-- Para re-cifrar datos existentes, ejecutar un script manual
-- que lea, transforme y guarde cada registro.
-- ============================================================
