-- Adiciona todas as colunas da tabela agents que o frontend usa mas nunca foram criadas via migration
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS company_name          TEXT,
  ADD COLUMN IF NOT EXISTS company_address       TEXT,
  ADD COLUMN IF NOT EXISTS professional_name     TEXT,
  ADD COLUMN IF NOT EXISTS company_description   TEXT,
  ADD COLUMN IF NOT EXISTS company_products      TEXT,
  ADD COLUMN IF NOT EXISTS company_faq           TEXT,
  ADD COLUMN IF NOT EXISTS company_links         TEXT,
  ADD COLUMN IF NOT EXISTS voice_mode            TEXT DEFAULT 'disabled'
                                                 CHECK (voice_mode IN ('disabled', 'always', 'audio_only')),
  ADD COLUMN IF NOT EXISTS voice_id              TEXT,
  ADD COLUMN IF NOT EXISTS knowledge_base        JSONB,
  ADD COLUMN IF NOT EXISTS whatsapp_provider_config JSONB;
