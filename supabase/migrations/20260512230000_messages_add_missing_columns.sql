-- Adiciona todas as colunas que a função upsert_inbound_message referencia
-- mas que podem não existir em bancos criados antes dessas features.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS quoted_id    TEXT,
  ADD COLUMN IF NOT EXISTS quoted_text  TEXT,
  ADD COLUMN IF NOT EXISTS contact_jid  TEXT;
