-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 001-add-performance-indexes
-- Description: Añade índices faltantes para optimizar consultas frecuentes
-- Ejecutar: psql -U postgres -d innochat -f 001-add-performance-indexes.sql
-- ══════════════════════════════════════════════════════════════════════════════

-- ── sessions ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
CREATE INDEX IF NOT EXISTS idx_sessions_advisor_id ON sessions (advisor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_advisor_id_status ON sessions (advisor_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_status_created_at ON sessions (status, created_at DESC);

-- ── messages ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id_created_at ON messages (session_id, created_at ASC);

-- ── users ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users (role, active);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);

-- ── whatsapp_chats ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_assigned_advisor_id ON whatsapp_chats (assigned_advisor_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_fixed_advisor_id ON whatsapp_chats (fixed_advisor_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_status ON whatsapp_chats (status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_operational_status ON whatsapp_chats (operational_status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_assigned_advisor_id_status ON whatsapp_chats (assigned_advisor_id, status);

-- ── whatsapp_messages ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chat_id ON whatsapp_messages (chat_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chat_id_created_at ON whatsapp_messages (chat_id, created_at ASC);

-- ── comunicados ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_comunicados_sender_id ON comunicados (sender_id);
CREATE INDEX IF NOT EXISTS idx_comunicados_status ON comunicados (status);
CREATE INDEX IF NOT EXISTS idx_comunicados_sender_id_status ON comunicados (sender_id, status);
CREATE INDEX IF NOT EXISTS idx_comunicados_created_at ON comunicados (created_at DESC);
