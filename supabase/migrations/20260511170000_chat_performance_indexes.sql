-- ============================================================
-- Chat Performance Indexes
-- Melhora drasticamente a performance das queries mais frequentes
-- do módulo de chat: listagem de mensagens, threads e contatos.
-- ============================================================

-- 1. Índice composto para busca de mensagens por thread (a query mais frequente)
-- Suporta: .eq('thread_id', id).order('created_at', ascending: true)
CREATE INDEX IF NOT EXISTS idx_messages_thread_created 
  ON public.messages (thread_id, created_at ASC);

-- 2. Índice para busca de mensagens por whatsapp_id (deduplicação de webhook)
-- Suporta: .eq('whatsapp_id', id).eq('user_id', id)
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id_user 
  ON public.messages (whatsapp_id, user_id) 
  WHERE whatsapp_id IS NOT NULL;

-- 3. Índice para busca de threads por usuário ordenadas por última mensagem (sidebar)
-- Suporta: .eq('user_id', id).order('last_message_time', descending: true)
CREATE INDEX IF NOT EXISTS idx_threads_user_last_msg 
  ON public.threads (user_id, last_message_time DESC NULLS LAST);

-- 4. Índice para busca de contatos por usuário (join com threads)
CREATE INDEX IF NOT EXISTS idx_contacts_user_id 
  ON public.contacts (user_id);

-- 5. Índice para busca aproximada de telefone (normalização do 9º dígito)
-- Suporta: .ilike('telefone', '%XXXXXXXX')
CREATE INDEX IF NOT EXISTS idx_contacts_telefone_pattern 
  ON public.contacts (user_id, telefone text_pattern_ops);

-- 6. Índice para filtrar mensagens por status (monitoramento de mensagens travadas)
CREATE INDEX IF NOT EXISTS idx_messages_status_user 
  ON public.messages (user_id, status) 
  WHERE status IN ('sending', 'pending', 'failed');

-- 7. Índice para busca de threads por ticket_status (abertos/resolvidos)
CREATE INDEX IF NOT EXISTS idx_threads_ticket_status 
  ON public.threads (user_id, ticket_status);

-- 8. Índice parcial para threads com foto a atualizar
CREATE INDEX IF NOT EXISTS idx_threads_photo_update 
  ON public.threads (user_id, profile_picture_updated_at) 
  WHERE profile_picture_url IS NOT NULL;

