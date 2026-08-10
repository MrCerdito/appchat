-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 004-add-widget-chat-avatar
-- Description: Añade la columna chat_avatar a widget_config para mostrar el
-- logo/avatar de la empresa en el header del chat y en la burbuja del widget.
-- Ejecutar: psql -U postgres -d innochat -f 004-add-widget-chat-avatar.sql
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE widget_config ADD COLUMN IF NOT EXISTS chat_avatar varchar(500) NOT NULL DEFAULT '';
