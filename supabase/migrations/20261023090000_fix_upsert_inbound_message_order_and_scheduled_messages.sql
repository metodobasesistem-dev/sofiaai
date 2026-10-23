-- MIGRATION: 20261023090000_fix_upsert_inbound_message_order_and_scheduled_messages.sql
-- 
-- 1. CORREÇÃO CRÍTICA NA ORDEM DA RPC upsert_inbound_message:
--    A tabela messages possui foreign key para threads (messages_thread_id_fkey).
--    Em versões anteriores, a RPC realizava INSERT em messages ANTES de threads,
--    causando violação de chave estrangeira (FK 23503) em conversas e leads novos.
--    Ordem correta e garantida:
--      1º CONTACTS
--      2º THREADS (garante a existência de threads.id para a FK)
--      3º MESSAGES (agora a FK é satisfeita com sucesso)
--
-- 2. CRIAÇÃO DAS TABELAS scheduled_messages E follow_up_templates (se ainda não existirem):
--    Elimina erros PGRST205 ("Could not find the table 'public.scheduled_messages' in the schema cache").

-- ── 1. Tabelas de suporte a mensagens programadas e follow-ups ──
CREATE TABLE IF NOT EXISTS public.follow_up_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  conteudo   TEXT NOT NULL,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  ordem      INTEGER NOT NULL DEFAULT 0,
  gatilho    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, nome)
);

CREATE INDEX IF NOT EXISTS follow_up_templates_user_idx
  ON public.follow_up_templates (user_id, ordem);

ALTER TABLE public.follow_up_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.follow_up_templates FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id   TEXT NOT NULL,
  telefone    TEXT NOT NULL,
  conteudo    TEXT NOT NULL,
  enviar_em   TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'enviada', 'cancelada', 'falhou')),
  erro        TEXT,
  enviada_em  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  template_id UUID REFERENCES public.follow_up_templates(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS scheduled_messages_pendentes_idx
  ON public.scheduled_messages (enviar_em)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS scheduled_messages_thread_idx
  ON public.scheduled_messages (user_id, thread_id, enviar_em);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_messages FROM anon, authenticated;


-- ── 2. RPC: upsert_inbound_message com a ordem correta (contact -> thread -> message) ──
CREATE OR REPLACE FUNCTION public.upsert_inbound_message(
  p_message JSONB,
  p_thread  JSONB,
  p_contact JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  -- ──────────────────────────────────────────────────────────
  -- 1. CONTATO (deve existir antes da thread)
  -- ──────────────────────────────────────────────────────────
  INSERT INTO contacts (
    id,
    user_id,
    telefone,
    nome,
    status_funil,
    source,
    ultima_mensagem,
    ultima_interacao,
    primeiro_contato,
    data_criacao,
    total_mensagens
  )
  VALUES (
    p_contact->>'id',
    (p_contact->>'user_id')::uuid,
    p_contact->>'telefone',
    COALESCE(NULLIF(TRIM(p_contact->>'nome'), ''), p_contact->>'telefone', 'Lead WhatsApp'),
    COALESCE(p_contact->>'status_funil', 'Lead'),
    COALESCE(p_contact->>'source', 'whatsapp'),
    p_contact->>'ultima_mensagem',
    COALESCE((p_contact->>'ultima_interacao')::timestamptz, NOW()),
    COALESCE((p_contact->>'primeiro_contato')::timestamptz, NOW()),
    COALESCE((p_contact->>'data_criacao')::timestamptz, NOW()),
    COALESCE((p_contact->>'total_mensagens')::integer, 1)
  )
  ON CONFLICT (id) DO UPDATE SET
    ultima_mensagem  = EXCLUDED.ultima_mensagem,
    ultima_interacao = EXCLUDED.ultima_interacao,
    total_mensagens  = CASE
      WHEN COALESCE((p_contact->>'increment_count')::boolean, false)
      THEN contacts.total_mensagens + 1
      ELSE contacts.total_mensagens
    END,
    nome = CASE
      WHEN EXCLUDED.nome IS NULL OR TRIM(EXCLUDED.nome) = ''
           OR EXCLUDED.nome ~ '^[0-9+\-\s().]+$'
      THEN COALESCE(contacts.nome, EXCLUDED.nome)
      ELSE EXCLUDED.nome
    END,
    status_funil = CASE
      WHEN COALESCE((p_contact->>'reopen_ticket')::boolean, false)
        AND contacts.status_funil = 'Resolvido'
      THEN 'Lead'
      ELSE contacts.status_funil
    END;


  -- ──────────────────────────────────────────────────────────
  -- 2. THREAD (deve existir antes da message para satisfazer a FK messages_thread_id_fkey)
  -- ──────────────────────────────────────────────────────────
  INSERT INTO threads (
    id,
    user_id,
    remote_jid,
    display_phone,
    contact_name,
    last_message,
    last_message_time,
    status,
    unread_count,
    ticket_status,
    agent_name,
    updated_at,
    profile_picture_url,
    profile_picture_updated_at,
    last_inbound_at,
    first_inbound_at
  )
  VALUES (
    p_thread->>'id',
    (p_thread->>'user_id')::uuid,
    p_thread->>'remote_jid',
    p_thread->>'display_phone',
    p_thread->>'contact_name',
    p_thread->>'last_message',
    (p_thread->>'last_message_time')::timestamptz,
    COALESCE(p_thread->>'status', 'ia'),
    COALESCE((p_thread->>'unread_count')::integer, 0),
    COALESCE(p_thread->>'ticket_status', 'open'),
    p_thread->>'agent_name',
    COALESCE((p_thread->>'updated_at')::timestamptz, NOW()),
    p_thread->>'profile_picture_url',
    (p_thread->>'profile_picture_updated_at')::timestamptz,
    (p_thread->>'last_inbound_at')::timestamptz,
    -- fallback para last_inbound_at: backends antigos não enviam first_inbound_at
    COALESCE(
      (p_thread->>'first_inbound_at')::timestamptz,
      (p_thread->>'last_inbound_at')::timestamptz
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    last_message             = EXCLUDED.last_message,
    last_message_time        = EXCLUDED.last_message_time,
    unread_count             = EXCLUDED.unread_count,
    ticket_status            = EXCLUDED.ticket_status,
    agent_name               = COALESCE(EXCLUDED.agent_name, threads.agent_name),
    updated_at               = EXCLUDED.updated_at,
    -- last_inbound_at: só atualiza se o novo valor for mais recente.
    -- Mensagens outbound passam NULL → preserva o valor existente.
    last_inbound_at          = CASE
      WHEN EXCLUDED.last_inbound_at IS NOT NULL
        AND (threads.last_inbound_at IS NULL OR EXCLUDED.last_inbound_at > threads.last_inbound_at)
      THEN EXCLUDED.last_inbound_at
      ELSE threads.last_inbound_at
    END,
    -- first_inbound_at: marca o momento em que o lead falou pela PRIMEIRA vez.
    -- Uma vez preenchido, nunca muda (é o gatilho de "Novo Lead").
    first_inbound_at         = COALESCE(threads.first_inbound_at, EXCLUDED.first_inbound_at),
    -- Prioridade de nome: novo valor real > existente > nunca número puro
    contact_name             = CASE
      WHEN EXCLUDED.contact_name IS NOT NULL
        AND LENGTH(TRIM(EXCLUDED.contact_name)) > 0
        AND EXCLUDED.contact_name !~ '^[0-9+\-\s().]+$'
      THEN EXCLUDED.contact_name
      ELSE COALESCE(threads.contact_name, EXCLUDED.contact_name)
    END,
    -- Preserva foto existente quando não é fornecida uma nova
    profile_picture_url      = COALESCE(EXCLUDED.profile_picture_url, threads.profile_picture_url),
    profile_picture_updated_at = COALESCE(
      EXCLUDED.profile_picture_updated_at,
      threads.profile_picture_updated_at
    );


  -- ──────────────────────────────────────────────────────────
  -- 3. MENSAGEM (idempotente via UNIQUE whatsapp_id + user_id)
  -- ──────────────────────────────────────────────────────────
  INSERT INTO messages (
    id,
    user_id,
    thread_id,
    text,
    direction,
    status,
    timestamp,
    audio_url,
    message_type,
    media_url,
    media_mime_type,
    media_filename,
    caption,
    is_external,
    quoted_id,
    quoted_text,
    whatsapp_id,
    contact_jid,
    is_ai,
    tokens_prompt,
    tokens_completion,
    cost_brl,
    created_at
  )
  VALUES (
    CASE
      WHEN (p_message->>'id') ~ '^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})$'
      THEN (p_message->>'id')::uuid
      ELSE gen_random_uuid()
    END,
    (p_message->>'user_id')::uuid,
    p_message->>'thread_id',
    COALESCE(p_message->>'text', ''),
    p_message->>'direction',
    COALESCE(p_message->>'status', 'sent'),
    (p_message->>'timestamp')::bigint,
    p_message->>'audio_url',
    COALESCE(p_message->>'message_type', 'text'),
    p_message->>'media_url',
    p_message->>'media_mime_type',
    p_message->>'media_filename',
    p_message->>'caption',
    COALESCE((p_message->>'is_external')::boolean, false),
    p_message->>'quoted_id',
    p_message->>'quoted_text',
    p_message->>'whatsapp_id',
    p_message->>'contact_jid',
    COALESCE((p_message->>'is_ai')::boolean, false),
    COALESCE((p_message->>'tokens_prompt')::integer, 0),
    COALESCE((p_message->>'tokens_completion')::integer, 0),
    COALESCE((p_message->>'cost_brl')::numeric, 0),
    COALESCE((p_message->>'created_at')::timestamptz, NOW())
  )
  ON CONFLICT (whatsapp_id, user_id) DO NOTHING;


  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  -- Retorna erro como dado (não como exceção) para que o chamador
  -- possa inspecionar o SQLSTATE e decidir se deve ou não retentar.
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM,
    'code',    SQLSTATE
  );

END;
$$;

REVOKE ALL ON FUNCTION public.upsert_inbound_message(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_inbound_message(JSONB, JSONB, JSONB) TO service_role;
