-- PART 4: DATABASE FUNCTIONS & REMOTE PROCEDURE CALLS (RPC)
-- Execute this block last in the Supabase SQL Editor.

-- 1. Sofia Memory Vector Match Function
CREATE OR REPLACE FUNCTION match_sofia_memory (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sofia_memory.id,
    sofia_memory.content,
    1 - (sofia_memory.embedding <=> query_embedding) AS similarity
  FROM sofia_memory
  WHERE 1 - (sofia_memory.embedding <=> query_embedding) > match_threshold
    AND sofia_memory.tenant_id = p_tenant_id
  ORDER BY sofia_memory.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


-- 2. Consolidated Inbound Message Upsert Function (Transaction Safe)
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

  -- ─── 1. CONTACT (Must exist before thread to satisfy foreign key if any)
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


  -- ─── 2. THREAD (Must exist before message to satisfy FK threads.id)
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
    profile_picture_updated_at
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
    (p_thread->>'profile_picture_updated_at')::timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    last_message               = EXCLUDED.last_message,
    last_message_time          = EXCLUDED.last_message_time,
    unread_count               = EXCLUDED.unread_count,
    ticket_status              = EXCLUDED.ticket_status,
    agent_name                 = COALESCE(EXCLUDED.agent_name, threads.agent_name),
    updated_at                 = EXCLUDED.updated_at,
    contact_name               = CASE
      WHEN EXCLUDED.contact_name IS NOT NULL
        AND LENGTH(TRIM(EXCLUDED.contact_name)) > 0
        AND EXCLUDED.contact_name !~ '^[0-9+\-\s().]+$'
      THEN EXCLUDED.contact_name
      ELSE COALESCE(threads.contact_name, EXCLUDED.contact_name)
    END,
    profile_picture_url        = COALESCE(EXCLUDED.profile_picture_url, threads.profile_picture_url),
    profile_picture_updated_at = COALESCE(
      EXCLUDED.profile_picture_updated_at,
      threads.profile_picture_updated_at
    );


  -- ─── 3. MESSAGE (Idempotent via UNIQUE whatsapp_id + user_id)
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
    p_message->>'id',
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
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM,
    'code',    SQLSTATE
  );

END;
$$;

-- Restrict public execution; only service_role (backend) can run this RPC.
REVOKE ALL ON FUNCTION public.upsert_inbound_message(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_inbound_message(JSONB, JSONB, JSONB) TO service_role;
