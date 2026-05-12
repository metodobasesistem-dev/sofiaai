-- ============================================================
-- Idempotência no processamento de webhooks do Instagram
--
-- Adiciona índice UNIQUE em instagram_message_id para garantir
-- que o mesmo evento (comentário ou DM) nunca seja processado
-- duas vezes, mesmo que a Meta entregue o webhook duplicado ou
-- o worker BullMQ execute a tarefa mais de uma vez após retry.
--
-- Cobre apenas linhas onde instagram_message_id IS NOT NULL
-- (DMs enviadas sem source não têm esse campo preenchido).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS leo_insta_interacoes_message_id_unique
  ON leo_instagram_interacoes (instagram_message_id)
  WHERE instagram_message_id IS NOT NULL;
