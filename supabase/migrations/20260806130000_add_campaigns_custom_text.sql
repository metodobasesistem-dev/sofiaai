-- Adiciona suporte a mensagem personalizada (texto livre) em disparos de campanhas
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'template',
  ADD COLUMN IF NOT EXISTS custom_text TEXT;
