-- Migration 003: Performance indexes + security columns
-- Run: psql -h 127.0.0.1 -p 5433 -U postgres -d app -f migrations/003-indexes-and-security.sql

-- ══════════════════════════════════════════════════════════════════════
-- PERFORMANCE INDEXES
-- ══════════════════════════════════════════════════════════════════════

-- whatsapp_chats: compound indexes for assignment queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_chats_status_is_group
  ON whatsapp_chats (status, is_group);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_chats_last_message_at
  ON whatsapp_chats (last_message_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_chats_status_opstatus
  ON whatsapp_chats (status, operational_status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_chats_fixed_advisor
  ON whatsapp_chats (fixed_advisor_id)
  WHERE fixed_advisor_id IS NOT NULL;

-- whatsapp_messages: advisor_id index for dashboard queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_messages_advisor_id
  ON whatsapp_messages (advisor_id)
  WHERE advisor_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_messages_type
  ON whatsapp_messages (type);

-- messages: sender_type index for mark_as_read + metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_type
  ON messages (sender_type);

-- comunicado_eventos: FK index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comunicado_eventos_comunicado_id
  ON comunicado_eventos (comunicado_id);

-- sessions: closedAt for metrics queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_closed_at
  ON sessions (closed_at)
  WHERE closed_at IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- SECURITY COLUMNS
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts int NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locked_until timestamp NULL;

-- ══════════════════════════════════════════════════════════════════════
-- AUDIT LOG TABLE
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NULL,
  entity_id VARCHAR(255) NULL,
  detail JSONB NULL,
  ip VARCHAR(50) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
