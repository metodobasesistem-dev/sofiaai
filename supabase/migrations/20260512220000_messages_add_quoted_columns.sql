-- Adiciona colunas de mensagem citada (reply) na tabela messages.
-- Necessário para a função upsert_inbound_message funcionar corretamente.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS quoted_id   TEXT,
  ADD COLUMN IF NOT EXISTS quoted_text TEXT;
