-- Adicionar coluna de provider na tabela de agentes
ALTER TABLE agents ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT DEFAULT 'evolution' CHECK (whatsapp_provider IN ('evolution', 'uazapi', 'meta_official'));

-- Adicionar Feature Flag para abstração de provider
INSERT INTO feature_flags (key, label, description, enabled) VALUES
('whatsapp_provider_abstraction', 'Abstração de WhatsApp Provider', 'Habilita o uso da Factory de Providers (Ports & Adapters) para desacoplamento da Evolution API.', false)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN agents.whatsapp_provider IS 'Define qual API de WhatsApp este agente utiliza para comunicação.';
