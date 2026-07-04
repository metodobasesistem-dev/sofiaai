-- Adicionar coluna booleana de validação do WhatsApp no Radar de Leads
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS whatsapp_exists BOOLEAN;
