CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.whatsapp_chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone varchar(100) NOT NULL UNIQUE,
  jid varchar(100) NULL,
  is_group boolean NOT NULL DEFAULT false,
  name varchar(120) NOT NULL,
  profile_picture_url text NULL,
  role varchar(120) NOT NULL DEFAULT 'Cliente WhatsApp',
  institution varchar(160) NOT NULL DEFAULT 'WhatsApp',
  institution_url varchar(500) NULL,
  city varchar(120) NOT NULL DEFAULT '',
  email varchar(160) NULL,
  plan varchar(120) NOT NULL DEFAULT 'WhatsApp',
  modules jsonb NOT NULL DEFAULT '["Atencion"]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'waiting',
  operational_status varchar(30) NOT NULL DEFAULT 'new',
  operational_status_updated_at timestamp NULL,
  assigned_advisor_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  fixed_advisor_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  assignment_mode varchar(20) NULL,
  unread_count integer NOT NULL DEFAULT 0,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_message_at timestamp NULL,
  last_client_message_at timestamp NULL,
  assigned_at timestamp NULL,
  queue_notice_sent boolean NOT NULL DEFAULT false,
  out_of_hours_notice_sent boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_message_id varchar(255) NULL UNIQUE,
  chat_id uuid NOT NULL REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE,
  body text NOT NULL,
  from_me boolean NOT NULL DEFAULT false,
  sender_name varchar(120) NOT NULL,
  participant_jid varchar(100) NULL,
  advisor_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'delivered',
  is_auto boolean NOT NULL DEFAULT false,
  type varchar(30) NOT NULL DEFAULT 'text',
  media_id varchar(255) NULL,
  media_url text NULL,
  mime_type varchar(120) NULL,
  file_name varchar(255) NULL,
  file_size integer NULL,
  edited_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_status
  ON public.whatsapp_chats(status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_assigned_advisor
  ON public.whatsapp_chats(assigned_advisor_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_chats_jid_unique
  ON public.whatsapp_chats(jid)
  WHERE jid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chat_created
  ON public.whatsapp_messages(chat_id, created_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_last_message_at
  ON public.whatsapp_chats(last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_last_client_message_at
  ON public.whatsapp_chats(last_client_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_from_me
  ON public.whatsapp_messages(from_me);

ALTER TABLE IF EXISTS public.whatsapp_chats
  ALTER COLUMN phone TYPE varchar(100),
  ADD COLUMN IF NOT EXISTS jid varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_picture_url text NULL,
  ADD COLUMN IF NOT EXISTS role varchar(120) NOT NULL DEFAULT 'Cliente WhatsApp',
  ADD COLUMN IF NOT EXISTS institution varchar(160) NOT NULL DEFAULT 'WhatsApp',
  ADD COLUMN IF NOT EXISTS institution_url varchar(500) NULL,
  ADD COLUMN IF NOT EXISTS city varchar(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email varchar(160) NULL,
  ADD COLUMN IF NOT EXISTS plan varchar(120) NOT NULL DEFAULT 'WhatsApp',
  ADD COLUMN IF NOT EXISTS modules jsonb NOT NULL DEFAULT '["Atencion"]'::jsonb,
  ADD COLUMN IF NOT EXISTS operational_status varchar(30) NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS operational_status_updated_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS fixed_advisor_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_mode varchar(20) NULL,
  ADD COLUMN IF NOT EXISTS out_of_hours_notice_sent boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS participant_jid varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS media_id varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS media_url text NULL,
  ADD COLUMN IF NOT EXISTS mime_type varchar(120) NULL,
  ADD COLUMN IF NOT EXISTS file_name varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS file_size integer NULL,
  ADD COLUMN IF NOT EXISTS edited_at timestamp NULL;

ALTER TABLE IF EXISTS public.configuracion
  ADD COLUMN IF NOT EXISTS whatsapp_assignment_msg text NOT NULL DEFAULT 'Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.',
  ADD COLUMN IF NOT EXISTS whatsapp_queue_msg text NOT NULL DEFAULT 'Te encuentras en cola. En breves momentos un asesor se comunicara contigo.',
  ADD COLUMN IF NOT EXISTS whatsapp_out_of_hours_msg text NOT NULL DEFAULT 'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.',
  ADD COLUMN IF NOT EXISTS whatsapp_call_unavailable_msg text NOT NULL DEFAULT 'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.',
  ADD COLUMN IF NOT EXISTS whatsapp_quick_replies jsonb NOT NULL DEFAULT '["Hola, con gusto reviso tu caso.", "Dame un momento mientras valido la informacion.", "Quedo atento si necesitas algo mas."]'::jsonb;

CREATE TABLE IF NOT EXISTS public.teams_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  advisor_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at bigint NOT NULL,
  account_name varchar(255),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
