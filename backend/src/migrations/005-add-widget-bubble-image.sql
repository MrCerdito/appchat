-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 005-add-widget-bubble-image
-- Description: Añade la columna burbuja_imagen a widget_config para mostrar una
-- imagen directamente dentro de la burbuja de bienvenida (sin círculo de avatar).
-- Se elimina el uso de chat_avatar (avatar/logo) en la burbuja y en el header.
-- Ejecutar: psql -U postgres -d innochat -f 005-add-widget-bubble-image.sql
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE widget_config ADD COLUMN IF NOT EXISTS burbuja_imagen varchar(500) NOT NULL DEFAULT '';
