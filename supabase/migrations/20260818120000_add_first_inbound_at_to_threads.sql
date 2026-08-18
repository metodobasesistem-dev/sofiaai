-- Notificação de "Novo Lead" deve disparar apenas quando o LEAD envia a primeira
-- mensagem dele — não quando nós iniciamos a conversa (prospecção/campanha).
--
-- Antes, o sino usava contacts.data_criacao, que é preenchido também quando o
-- contato é criado por um disparo nosso. Resultado: "Novo Lead" para gente que
-- nunca respondeu, e duplicidade quando o mesmo telefone existia em dois
-- registros de contacts (id UUID vs. {userId}_{phone}, com/sem o 9º dígito).
--
-- Fonte de verdade nova: threads.first_inbound_at — timestamp da PRIMEIRA
-- mensagem inbound da thread. A PK da thread é {userId}_{phone_normalizado},
-- então é naturalmente única por lead.

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS first_inbound_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS threads_first_inbound_at_idx
  ON public.threads (user_id, first_inbound_at DESC)
  WHERE first_inbound_at IS NOT NULL;

-- Backfill: primeira mensagem inbound de cada thread (ignora timestamps
-- corrompidos anteriores a 2020, mesmo filtro usado no backfill de last_inbound_at).
UPDATE public.threads t
SET first_inbound_at = sub.first_in
FROM (
  SELECT thread_id, to_timestamp(MIN(timestamp) / 1000.0) AS first_in
  FROM public.messages
  WHERE direction = 'inbound'
    AND timestamp > 1577836800000  -- > 2020-01-01 em ms
  GROUP BY thread_id
) sub
WHERE t.id = sub.thread_id
  AND t.first_inbound_at IS NULL;


-- ──────────────────────────────────────────────────────────────────────────
-- RPC: grava first_inbound_at na primeira inbound e NUNCA o sobrescreve.
-- (Reescreve a função inteira — mesma lógica de 20260527130000, acrescida da
--  nova coluna.)
-- ──────────────────────────────────────────────────────────────────────────
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
  -- 1. MENSAGEM
  --    Idempotente via UNIQUE (whatsapp_id, user_id).
  --    DO NOTHING em duplicatas — o webhook pode re-entregar.
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


  -- ──────────────────────────────────────────────────────────
  -- 2. THREAD
  --    Atualiza last_message, unread_count e ticket_status.
  --    last_inbound_at é atualizado atomicamente aqui (se fornecido).
  --    first_inbound_at é gravado só na primeira inbound (imutável depois).
  --    Preserva a foto de perfil existente se não for fornecida.
  --    Nunca sobrescreve contact_name real com número de telefone.
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
  -- 3. CONTATO
  --    Cria novo contato com dados completos, ou atualiza apenas
  --    os campos de interação (nunca sobrescreve nome real com
  --    número de telefone puro).
  --    Flags especiais no payload:
  --      increment_count  BOOL → incrementa total_mensagens
  --      reopen_ticket    BOOL → move 'Resolvido' → 'Lead'
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
    -- Incrementa contador apenas quando explicitamente solicitado
    total_mensagens  = CASE
      WHEN COALESCE((p_contact->>'increment_count')::boolean, false)
      THEN contacts.total_mensagens + 1
      ELSE contacts.total_mensagens
    END,
    -- Nunca sobrescreve nome real com número de telefone
    nome = CASE
      WHEN EXCLUDED.nome IS NULL OR TRIM(EXCLUDED.nome) = ''
           OR EXCLUDED.nome ~ '^[0-9+\-\s().]+$'
      THEN COALESCE(contacts.nome, EXCLUDED.nome)
      ELSE EXCLUDED.nome
    END,
    -- Reabre ticket ao receber nova mensagem de contato resolvido
    status_funil = CASE
      WHEN COALESCE((p_contact->>'reopen_ticket')::boolean, false)
        AND contacts.status_funil = 'Resolvido'
      THEN 'Lead'
      ELSE contacts.status_funil
    END;


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
