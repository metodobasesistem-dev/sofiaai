-- Adiciona coluna de provedor global do WhatsApp
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT DEFAULT 'evolution';

-- Atualiza valor padrão se necessário
UPDATE global_settings SET whatsapp_provider = 'evolution' WHERE whatsapp_provider IS NULL;
